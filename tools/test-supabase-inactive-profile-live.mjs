import { readFile } from "node:fs/promises";
import { createInterface } from "node:readline/promises";

const configPath = process.env.TDW_RLS_TEST_CONFIG;
if (!configPath) {
  throw new Error("TDW_RLS_TEST_CONFIG is required");
}

const config = JSON.parse(await readFile(configPath, "utf8"));
const { url, publishableKey, users } = config;
const viewer = users?.find((user) => user.role === "viewer");
if (!url || !publishableKey || !viewer?.email || !viewer?.password) {
  throw new Error("Invalid inactive-profile test configuration");
}

const authResponse = await fetch(
  `${url}/auth/v1/token?grant_type=password`,
  {
    method: "POST",
    headers: {
      apikey: publishableKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email: viewer.email,
      password: viewer.password,
    }),
  },
);
const auth = await authResponse.json();
if (authResponse.status !== 200 || !auth.access_token) {
  throw new Error(`Viewer authentication failed (${authResponse.status})`);
}

async function request(path, method = "GET", body) {
  const response = await fetch(`${url}${path}`, {
    method,
    headers: {
      apikey: publishableKey,
      Authorization: `Bearer ${auth.access_token}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  return {
    status: response.status,
    data: text ? JSON.parse(text) : null,
  };
}

const before = await request("/rest/v1/roles?select=code&limit=1");
if (before.status !== 200 || !Array.isArray(before.data) || before.data.length !== 1) {
  throw new Error("Viewer was not active before the test");
}

console.log(JSON.stringify({
  ready: true,
  instruction: "Deactivate the viewer profile, then press Enter.",
}));

const prompt = createInterface({
  input: process.stdin,
  output: process.stdout,
});
await prompt.question("");
prompt.close();

const activeCheck = await request("/rest/v1/rpc/is_active_user", "POST", {});
const rolesAfter = await request("/rest/v1/roles?select=code&limit=1");
const passed =
  activeCheck.status === 200
  && activeCheck.data === false
  && rolesAfter.status === 200
  && Array.isArray(rolesAfter.data)
  && rolesAfter.data.length === 0;

console.log(JSON.stringify({
  checked_at: new Date().toISOString(),
  passed,
  results: [
    {
      name: "inactive_profile.existing_session_is_active",
      expected: false,
      actual: activeCheck.data,
      status: activeCheck.status,
    },
    {
      name: "inactive_profile.existing_session_roles_visible",
      expected: 0,
      actual: Array.isArray(rolesAfter.data) ? rolesAfter.data.length : null,
      status: rolesAfter.status,
    },
  ],
}, null, 2));

if (!passed) process.exitCode = 1;
