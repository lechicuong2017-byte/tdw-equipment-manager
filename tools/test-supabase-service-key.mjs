const url = String(process.env.SUPABASE_URL || "").replace(/\/$/, "");
const serviceKey = String(
  process.env.SUPABASE_SERVICE_ROLE_KEY || "",
).trim();

if (!url || !serviceKey) {
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
}

const response = await fetch(`${url}/auth/v1/admin/users?page=1&per_page=1`, {
  headers: {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
  },
});
const text = await response.text();
let data = null;
try {
  data = text ? JSON.parse(text) : null;
} catch {
  data = null;
}

const passed = response.status === 200 && Array.isArray(data?.users);
console.log(JSON.stringify({
  checked_at: new Date().toISOString(),
  passed,
  auth_admin_status: response.status,
  returned_user_count: Array.isArray(data?.users) ? data.users.length : null,
}, null, 2));

if (!passed) process.exitCode = 1;
