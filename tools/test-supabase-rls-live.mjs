import { readFile } from "node:fs/promises";

const configPath = process.env.TDW_RLS_TEST_CONFIG;
if (!configPath) {
  throw new Error("TDW_RLS_TEST_CONFIG is required");
}

const config = JSON.parse(await readFile(configPath, "utf8"));
const { url, publishableKey, runTag, users } = config;
if (!url || !publishableKey || !runTag || !Array.isArray(users)) {
  throw new Error("Invalid RLS test configuration");
}

const usersByRole = Object.fromEntries(users.map((user) => [user.role, user]));
const requiredRoles = ["admin", "manager", "user", "viewer"];
for (const role of requiredRoles) {
  if (!usersByRole[role]?.email || !usersByRole[role]?.password) {
    throw new Error(`Missing credentials for ${role}`);
  }
}

const sessions = {};
const results = [];
let assetId = null;
let objectPath = null;

function record(name, expected, actual, detail = {}) {
  const passed = expected === actual;
  results.push({ name, passed, expected, actual, ...detail });
  return passed;
}

function decodeJwtPayload(token) {
  const encoded = token.split(".")[1];
  return JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
}

async function request(path, {
  role,
  method = "GET",
  body,
  headers = {},
} = {}) {
  const token = role ? sessions[role]?.accessToken : null;
  const response = await fetch(`${url}${path}`, {
    method,
    headers: {
      apikey: publishableKey,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body && !(body instanceof Uint8Array)
        ? { "Content-Type": "application/json" }
        : {}),
      ...headers,
    },
    body:
      body === undefined
        ? undefined
        : body instanceof Uint8Array
          ? body
          : JSON.stringify(body),
  });
  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  return { status: response.status, data };
}

async function signIn(role) {
  const user = usersByRole[role];
  const response = await request("/auth/v1/token?grant_type=password", {
    method: "POST",
    body: { email: user.email, password: user.password },
  });
  const accessToken = response.data?.access_token;
  if (response.status !== 200 || !accessToken) {
    record(`auth.${role}`, 200, response.status, {
      error:
        response.data?.message
        ?? response.data?.msg
        ?? response.data?.error_description
        ?? response.data?.error
        ?? null,
    });
    return;
  }
  const claims = decodeJwtPayload(accessToken);
  sessions[role] = {
    accessToken,
    userId: response.data.user.id,
    aal: claims.aal,
  };
  record(`auth.${role}`, 200, response.status, { aal: claims.aal });
}

for (const role of requiredRoles) {
  await signIn(role);
}

if (requiredRoles.some((role) => !sessions[role])) {
  console.log(JSON.stringify({
    checked_at: new Date().toISOString(),
    run_tag: runTag,
    passed: false,
    results,
  }, null, 2));
  process.exit(1);
}

record("admin.jwt_aal", "aal1", sessions.admin.aal);

const malformedJwt = await request("/rest/v1/assets?select=id&limit=1", {
  headers: {
    Authorization: `Bearer ${sessions.viewer.accessToken}x`,
  },
});
record(
  "malformed_jwt.denied",
  true,
  malformedJwt.status >= 400,
  { status: malformedJwt.status },
);

const assetCode = `RLS-TEST-${runTag}`.toUpperCase();
const managerInsert = await request(
  "/rest/v1/assets?select=id,asset_code,created_by",
  {
    role: "manager",
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: {
      legacy_id: `rls-live:${runTag}`,
      asset_code: assetCode,
      asset_name: `RLS live test ${runTag}`,
      note: "Synthetic RLS test record; safe to remove",
    },
  },
);
record("manager.assets.insert", 201, managerInsert.status);
assetId = managerInsert.data?.[0]?.id ?? null;

if (assetId) {
  const selectCount = async (role) => {
    const response = await request(
      `/rest/v1/assets?id=eq.${assetId}&select=id`,
      { role },
    );
    return {
      status: response.status,
      count: Array.isArray(response.data) ? response.data.length : -1,
    };
  };

  const beforeAssignment = {
    admin: await selectCount("admin"),
    manager: await selectCount("manager"),
    user: await selectCount("user"),
    viewer: await selectCount("viewer"),
    anonymous: await selectCount(),
  };
  record("admin_aal1.assets.select", 0, beforeAssignment.admin.count, {
    status: beforeAssignment.admin.status,
  });
  record("manager.assets.select", 1, beforeAssignment.manager.count, {
    status: beforeAssignment.manager.status,
  });
  record("user_unassigned.assets.select", 0, beforeAssignment.user.count, {
    status: beforeAssignment.user.status,
  });
  record("viewer_unscoped.assets.select", 0, beforeAssignment.viewer.count, {
    status: beforeAssignment.viewer.status,
  });
  record(
    "anonymous.assets.select_denied",
    true,
    beforeAssignment.anonymous.status === 401
      || beforeAssignment.anonymous.count === 0,
    { status: beforeAssignment.anonymous.status },
  );

  const responsibility = await request(
    "/rest/v1/asset_responsibles",
    {
      role: "manager",
      method: "POST",
      body: {
        asset_id: assetId,
        user_id: sessions.user.userId,
        responsibility_role: "primary",
      },
    },
  );
  record("manager.asset_responsibles.insert", 201, responsibility.status);

  const userAfterAssignment = await selectCount("user");
  record("user_assigned.assets.select", 1, userAfterAssignment.count, {
    status: userAfterAssignment.status,
  });

  for (const role of ["admin", "user", "viewer"]) {
    const deniedInsert = await request("/rest/v1/assets", {
      role,
      method: "POST",
      body: {
        legacy_id: `rls-denied:${role}:${runTag}`,
        asset_code: `${assetCode}-${role}`.toUpperCase(),
        asset_name: `Denied ${role} insert`,
      },
    });
    record(`${role}.assets.insert_denied`, true, deniedInsert.status >= 400, {
      status: deniedInsert.status,
    });
  }

  const anonymousInsert = await request("/rest/v1/assets", {
    method: "POST",
    body: {
      legacy_id: `rls-denied:anonymous:${runTag}`,
      asset_code: `${assetCode}-ANON`,
      asset_name: "Denied anonymous insert",
    },
  });
  record(
    "anonymous.assets.insert_denied",
    true,
    anonymousInsert.status >= 400,
    { status: anonymousInsert.status },
  );

  objectPath =
    `${sessions.manager.userId}/${assetId}/rls-test-${runTag}.png`;
  const png = Uint8Array.from(
    Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z3NwAAAAASUVORK5CYII=",
      "base64",
    ),
  );
  const storageUpload = await request(
    `/storage/v1/object/asset-media/${objectPath}`,
    {
      role: "manager",
      method: "POST",
      body: png,
      headers: {
        "Content-Type": "image/png",
        "x-upsert": "false",
      },
    },
  );
  record("manager.storage.upload", 200, storageUpload.status);

  const wrongPathUpload = await request(
    `/storage/v1/object/asset-media/${sessions.viewer.userId}/${assetId}/wrong-path.png`,
    {
      role: "manager",
      method: "POST",
      body: png,
      headers: {
        "Content-Type": "image/png",
        "x-upsert": "false",
      },
    },
  );
  record(
    "manager.storage.wrong_user_path_denied",
    true,
    wrongPathUpload.status >= 400,
    { status: wrongPathUpload.status },
  );

  const wrongMimePath =
    `${sessions.manager.userId}/${assetId}/rls-test-${runTag}.txt`;
  const wrongMimeUpload = await request(
    `/storage/v1/object/asset-media/${wrongMimePath}`,
    {
      role: "manager",
      method: "POST",
      body: Uint8Array.from(Buffer.from("not an image")),
      headers: {
        "Content-Type": "text/plain",
        "x-upsert": "false",
      },
    },
  );
  record(
    "manager.storage.wrong_mime_denied",
    true,
    wrongMimeUpload.status >= 400,
    { status: wrongMimeUpload.status },
  );

  const oversizedPath =
    `${sessions.manager.userId}/${assetId}/oversized-${runTag}.png`;
  const oversizedUpload = await request(
    `/storage/v1/object/asset-media/${oversizedPath}`,
    {
      role: "manager",
      method: "POST",
      body: new Uint8Array((5 * 1024 * 1024) + 1),
      headers: {
        "Content-Type": "image/png",
        "x-upsert": "false",
      },
    },
  );
  record(
    "manager.storage.oversized_denied",
    true,
    oversizedUpload.status >= 400,
    { status: oversizedUpload.status },
  );

  const mismatchedMedia = await request("/rest/v1/media_files", {
    role: "manager",
    method: "POST",
    body: {
      owner_type: "ASSET",
      owner_id: sessions.viewer.userId,
      asset_id: assetId,
      bucket_id: "asset-media",
      object_path: `${objectPath}.mismatch`,
      file_name: `mismatched-${runTag}.png`,
      mime_type: "image/png",
      byte_size: png.byteLength,
    },
  });
  record(
    "manager.media_files.owner_mismatch_denied",
    true,
    mismatchedMedia.status >= 400,
    { status: mismatchedMedia.status },
  );

  const mediaInsert = await request("/rest/v1/media_files", {
    role: "manager",
    method: "POST",
    body: {
      owner_type: "ASSET",
      owner_id: assetId,
      asset_id: assetId,
      bucket_id: "asset-media",
      object_path: objectPath,
      file_name: `rls-test-${runTag}.png`,
      mime_type: "image/png",
      byte_size: png.byteLength,
    },
  });
  record("manager.media_files.insert", 201, mediaInsert.status);

  const downloadStatus = async (role) => {
    const response = await request(
      `/storage/v1/object/authenticated/asset-media/${objectPath}`,
      { role },
    );
    return response.status;
  };
  record("manager.storage.read", 200, await downloadStatus("manager"));
  record("user_assigned.storage.read", 200, await downloadStatus("user"));
  record(
    "viewer_unscoped.storage.read_denied",
    true,
    (await downloadStatus("viewer")) >= 400,
  );
  record(
    "admin_aal1.storage.read_denied",
    true,
    (await downloadStatus("admin")) >= 400,
  );
  record(
    "anonymous.storage.read_denied",
    true,
    (await downloadStatus()) >= 400,
  );

  const deleteObject = await request(
    `/storage/v1/object/asset-media/${objectPath}`,
    { role: "manager", method: "DELETE" },
  );
  record("manager.storage.delete", 200, deleteObject.status);

  const deleteMedia = await request(
    `/rest/v1/media_files?object_path=eq.${encodeURIComponent(objectPath)}`,
    { role: "manager", method: "DELETE" },
  );
  record("manager.media_files.delete", 204, deleteMedia.status);

  const deleteResponsible = await request(
    `/rest/v1/asset_responsibles?asset_id=eq.${assetId}`,
    { role: "manager", method: "DELETE" },
  );
  record(
    "manager.asset_responsibles.delete",
    204,
    deleteResponsible.status,
  );

  const managerDeletePermission = await request(
    "/rest/v1/rpc/has_permission",
    {
      role: "manager",
      method: "POST",
      body: { required_permission: "assets.delete" },
    },
  );
  record(
    "manager.assets.delete_permission",
    true,
    managerDeletePermission.data,
    { status: managerDeletePermission.status },
  );

  const managerAccess = await request(
    "/rest/v1/rpc/can_access_asset",
    {
      role: "manager",
      method: "POST",
      body: {
        target_asset_id: assetId,
        target_module: "assets",
        required_permission: "assets.manage",
      },
    },
  );
  record("manager.assets.manage_scope", true, managerAccess.data, {
    status: managerAccess.status,
  });

  const normalUpdate = await request(
    `/rest/v1/assets?id=eq.${assetId}`,
    {
      role: "manager",
      method: "PATCH",
      body: { note: "Synthetic RLS test record updated by manager" },
    },
  );
  record("manager.assets.update", 204, normalUpdate.status);

  await request(`/rest/v1/assets?id=eq.${assetId}`, {
    role: "manager",
    method: "DELETE",
    headers: { Prefer: "return=representation" },
  });
  const afterPhysicalDeleteAttempt = await selectCount("manager");
  record(
    "manager.assets.physical_delete_denied",
    1,
    afterPhysicalDeleteAttempt.count,
    { status: afterPhysicalDeleteAttempt.status },
  );

  const softDelete = await request(
    `/rest/v1/assets?id=eq.${assetId}`,
    {
      role: "manager",
      method: "PATCH",
      body: {
        deleted_at: new Date().toISOString(),
        deleted_by: sessions.manager.userId,
      },
    },
  );
  record(
    "manager.assets.soft_delete_direct_denied",
    true,
    softDelete.status >= 400,
    {
      status: softDelete.status,
      error_code: softDelete.data?.code ?? null,
    },
  );

  const viewerArchive = await request(
    "/rest/v1/rpc/archive_asset",
    {
      role: "viewer",
      method: "POST",
      body: { target_asset_id: assetId },
    },
  );
  record(
    "viewer.assets.archive_rpc_denied",
    true,
    viewerArchive.status >= 400,
    { status: viewerArchive.status },
  );

  const managerArchive = await request(
    "/rest/v1/rpc/archive_asset",
    {
      role: "manager",
      method: "POST",
      body: { target_asset_id: assetId },
    },
  );
  record("manager.assets.archive_rpc", 204, managerArchive.status, {
    error_code: managerArchive.data?.code ?? null,
    error_message: managerArchive.data?.message ?? null,
  });

  const archivedSelect = await request(
    `/rest/v1/assets?id=eq.${assetId}&select=id`,
    { role: "manager" },
  );
  record(
    "manager.assets.archived_hidden",
    0,
    Array.isArray(archivedSelect.data) ? archivedSelect.data.length : -1,
    { status: archivedSelect.status },
  );
}

const passed = results.every((result) => result.passed);
console.log(JSON.stringify({
  checked_at: new Date().toISOString(),
  run_tag: runTag,
  passed,
  cleanup: {
    asset_id: assetId,
    object_path: objectPath,
    auth_user_ids: users.map(({ role, id }) => ({ role, id })),
  },
  results,
}, null, 2));

if (!passed) process.exitCode = 1;
