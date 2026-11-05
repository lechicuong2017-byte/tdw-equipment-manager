// Kiểm thử tầng dữ liệu MariaDB (chạy: npm run test:db). Cần MariaDB với schema + dữ liệu thử.
import assert from "node:assert/strict";
import { QueryBuilder, type Session } from "@/lib/db/builder";
import { callRpc } from "@/lib/db/rpc";
import { loadAccessContext } from "@/lib/db/client";
import { PolicyFragments } from "@/lib/db/policy-fragments";
import { getPool } from "@/lib/db/pool";

const ADMIN = "11111111-1111-4111-8111-111111111111";
const USER = "22222222-2222-4222-8222-222222222222";
const DEPT_KT = "d1111111-1111-4111-8111-111111111111";
const DEPT_KY = "d2222222-2222-4222-8222-222222222222";
const LAPTOP = "a1111111-1111-4111-8111-111111111111";
const MONITOR = "a2222222-2222-4222-8222-222222222222";
const RAM = "a3333333-3333-4333-8333-333333333333";

async function sessionFor(userId: string, aal: "aal1" | "aal2" = "aal2"): Promise<Session> {
  const ctx = await loadAccessContext(userId, aal);
  return Object.assign({ mode: "user" as const, userId, fragments: new PolicyFragments(ctx) }, { aal, access: ctx });
}
const db = (s: Session) => ({
  from: (t: string) => new QueryBuilder(s, t),
  rpc: async (name: string, args: Record<string, unknown> = {}) => {
    try { return { data: await callRpc(name, args, { session: s, client: null }), error: null as any }; }
    catch (e) { return { data: null, error: e as any }; }
  },
});

const results: string[] = [];
async function test(name: string, fn: () => Promise<void>) {
  try { await fn(); results.push(`✓ ${name}`); }
  catch (e) { results.push(`✗ ${name}: ${(e as Error).message}`); }
}

const admin = db(await sessionFor(ADMIN));
const user = db(await sessionFor(USER));
const adminNoMfa = db(await sessionFor(ADMIN, "aal1"));

await test("select có quan hệ nhúng departments(name)", async () => {
  const r = await admin.from("assets").select("id, asset_code, departments(name)").order("asset_code");
  assert.equal(r.error, null);
  assert.equal(r.data!.length, 3);
  assert.equal((r.data![0] as any).departments.name, "Phòng Kế toán");
});
await test("count exact + head", async () => {
  const r = await admin.from("assets").select("*", { count: "exact", head: true }).is("deleted_at", null);
  assert.equal(r.count, 3); assert.equal(r.data, null);
});
await test("RLS: nhân viên chỉ thấy tài sản phòng mình", async () => {
  const r = await user.from("assets").select("asset_code").order("asset_code");
  assert.deepEqual((r.data as any[]).map((a) => a.asset_code), ["TDW-LT-2025-001", "TDW-RAM-2025-003"]);
});
await test("RLS: admin chưa MFA không đọc được tài sản", async () => {
  const r = await adminNoMfa.from("assets").select("id");
  assert.equal((r.data as any[]).length, 0);
});
await test("tìm kiếm không dấu (search_text ilike)", async () => {
  const r = await admin.from("assets").select("asset_code").ilike("search_text", "%nguyen van duc%");
  assert.equal((r.data as any[]).length, 1);
});
await test("or() + not() + in() + range()", async () => {
  const r = await admin.from("assets").select("asset_code").or("status.eq.MOI_100,asset_kind.eq.COMPONENT").not("serial_number", "is", null).in("department_id", [DEPT_KT]).order("asset_code").range(0, 0);
  assert.equal((r.data as any[]).length, 1);
});
await test("single() lỗi PGRST116 khi không có dòng", async () => {
  const r = await admin.from("assets").select("id").eq("asset_code", "KHONG-CO").single();
  assert.equal(r.error?.code, "PGRST116");
});
let newAssetId = "";
await test("insert tài sản: tự gán id, created_by, nhãn nhóm, tuổi tài sản, nhật ký", async () => {
  const r = await admin.from("assets").insert({
    asset_code: "TDW-PC-2023-010", asset_name: "Máy bộ cũ", asset_group: "MAY_TINH", asset_type: "LAPTOP",
    purchase_date: "2023-01-01", quantity: 2, unit_price: 1500000.5, department_id: DEPT_KY, status: "MOI_100",
  }).select("*").single();
  assert.equal(r.error, null, r.error?.message);
  const a = r.data as any;
  newAssetId = a.id;
  assert.match(a.id, /^[0-9a-f-]{36}$/);
  assert.equal(a.created_by, ADMIN);
  assert.equal(a.asset_group_label, "Máy tính");
  assert.equal(a.status, "CON_SU_DUNG", "tài sản > 1 năm phải chuyển CON_SU_DUNG");
  assert.equal(a.total_price, 3000001);
  assert.equal(typeof a.created_at, "string");
  const [log] = await getPool().query("SELECT action FROM audit_logs WHERE record_id = ? ORDER BY id DESC LIMIT 1", [a.id]) as any;
  assert.equal(log[0].action, "INSERT");
});
await test("unique có điều kiện: trùng mã tài sản -> 23505", async () => {
  const r = await admin.from("assets").insert({ asset_code: "tdw-pc-2023-010", asset_name: "Trùng", department_id: DEPT_KY });
  assert.equal(r.error?.code, "23505");
});
await test("RLS insert: nhân viên không tạo được tài sản phòng khác", async () => {
  const r = await user.from("assets").insert({ asset_code: "X-1", asset_name: "X", department_id: DEPT_KY });
  assert.ok(r.error, "phải bị chặn");
});
await test("RLS update: nhân viên không sửa được tài sản phòng khác (0 dòng)", async () => {
  const r = await user.from("assets").update({ note: "hack" }).eq("id", MONITOR).select("id");
  assert.equal((r.data as any[]).length, 0);
});
await test("update + updated_at tự cập nhật", async () => {
  const before = (await admin.from("assets").select("updated_at").eq("id", newAssetId).single()).data as any;
  await new Promise((r) => setTimeout(r, 20));
  const r = await admin.from("assets").update({ note: "Đã kiểm tra" }).eq("id", newAssetId).select("note, updated_at").single();
  assert.equal((r.data as any).note, "Đã kiểm tra");
  assert.notEqual((r.data as any).updated_at, before.updated_at);
});
await test("upsert theo onConflict", async () => {
  const r1 = await admin.from("departments").upsert({ name: "Phòng Hành chính" }, { onConflict: "name" }).select("id").single();
  const r2 = await admin.from("departments").upsert({ name: "Phòng Hành chính" }, { onConflict: "name" }).select("id").single();
  assert.equal(r1.error, null, r1.error?.message); assert.equal((r1.data as any).id, (r2.data as any).id);
});
await test("RPC next_asset_code", async () => {
  const r = await admin.rpc("next_asset_code", { target_prefix: "pc", target_year: 2023 });
  assert.equal(r.error, null, r.error?.message); assert.equal(r.data, "TDW-PC-2023-011");
});
await test("RPC lắp / tháo linh kiện + đồng bộ phòng ban", async () => {
  const inst = await admin.rpc("install_asset_component", { target_host_asset_id: newAssetId, target_component_asset_id: RAM, target_installed_at: "2026-01-02", target_slot_name: "Khe 1", target_note: "" });
  assert.equal(inst.error, null, inst.error?.message);
  let ram = (await admin.from("assets").select("department_id").eq("id", RAM).single()).data as any;
  assert.equal(ram.department_id, DEPT_KY);
  await admin.from("assets").update({ department_id: DEPT_KT }).eq("id", newAssetId);
  ram = (await admin.from("assets").select("department_id").eq("id", RAM).single()).data as any;
  assert.equal(ram.department_id, DEPT_KT, "linh kiện phải đi theo máy chủ");
  const dup = await admin.rpc("install_asset_component", { target_host_asset_id: LAPTOP, target_component_asset_id: RAM, target_installed_at: "2026-01-03", target_slot_name: "", target_note: "" });
  assert.equal(dup.error?.code, "23505");
  const rm = await admin.rpc("remove_asset_component", { target_installation_id: inst.data, target_removed_at: "2026-02-01", target_removal_reason: "Hỏng", target_removal_note: "", target_component_status: "KHONG_SU_DUNG" });
  assert.equal(rm.error, null, rm.error?.message);
});
await test("RPC thanh lý / khôi phục", async () => {
  const l = await admin.rpc("liquidate_asset", { target_asset_id: MONITOR, target_liquidation_date: "2026-10-01", target_recovery_value: 500000, target_reason: "Hỏng màn", target_note: "" });
  assert.equal(l.error, null, l.error?.message);
  assert.equal(((await admin.from("assets").select("status").eq("id", MONITOR).single()).data as any).status, "DA_THANH_LY");
  const r = await admin.rpc("restore_liquidated_asset", { target_asset_id: MONITOR });
  assert.equal(r.error, null, r.error?.message);
});
await test("RPC luân chuyển tài sản", async () => {
  const r = await admin.rpc("record_inventory_movement", { target_asset_id: LAPTOP, target_movement_date: "2026-11-01", target_to_user_name: "Lê Văn A", target_to_location: "Tầng 5" });
  assert.equal(r.error, null, r.error?.message);
  const a = (await admin.from("assets").select("assigned_to_name, location").eq("id", LAPTOP).single()).data as any;
  assert.equal(a.assigned_to_name, "Lê Văn A");
});
await test("Bảo trì: ghi nhật ký -> dời hạn kế hoạch + cập nhật ngày bảo trì", async () => {
  const plan = (await admin.from("maintenance_plans").select("id, next_due_date").eq("asset_id", LAPTOP).single()).data as any;
  const r = await admin.from("maintenance_logs").insert({ asset_id: LAPTOP, plan_id: plan.id, maintenance_date: "2026-12-05", action_type: "BAO_DUONG", description: "Vệ sinh" }).select("id").single();
  assert.equal(r.error, null, r.error?.message);
  const p2 = (await admin.from("maintenance_plans").select("next_due_date").eq("id", plan.id).single()).data as any;
  assert.equal(p2.next_due_date, "2027-02-28");
  const a = (await admin.from("assets").select("last_maintenance_date").eq("id", LAPTOP).single()).data as any;
  assert.equal(a.last_maintenance_date, "2026-12-05");
});
await test("RPC tạo kế hoạch bảo trì theo nhóm", async () => {
  const r = await admin.rpc("create_maintenance_plan_batch", { target_scope_type: "GROUP", target_scope_value: "MAY_TINH", target_title: "Kiểm tra định kỳ", target_frequency: "YEARLY", target_next_due_date: "2027-01-01" });
  assert.equal(r.error, null, r.error?.message); assert.ok(Number(r.data) >= 3);
});
await test("RPC thống kê dashboard (theo quyền)", async () => {
  const a = await admin.rpc("get_dashboard_stats"); const u = await user.rpc("get_dashboard_stats");
  assert.equal(a.error, null, a.error?.message);
  assert.ok((a.data as any).total_assets > (u.data as any).total_assets);
  assert.equal(typeof (a.data as any).by_status, "object");
});
await test("Xe: tạo đăng kiểm rồi gia hạn", async () => {
  const ins = await admin.from("vehicle_inspections").insert({ vehicle_id: "b1111111-1111-4111-8111-111111111111", inspection_date: "2025-12-01", expires_on: "2026-12-01", cost: 340000, reminder_days: 30 }).select("id").single();
  assert.equal(ins.error, null, ins.error?.message);
  const r = await admin.rpc("renew_vehicle_inspection", { target_source_inspection_id: (ins.data as any).id, target_vehicle_id: "b1111111-1111-4111-8111-111111111111", target_inspection_date: "2026-11-20", target_expires_on: "2027-11-20", target_cost: 340000, target_reminder_days: 30, target_certificate_number: "KĐ-01", target_inspection_center: "50-05V", target_seat_count: 7, target_odometer_km: 45000, target_note: "" });
  assert.equal(r.error, null, r.error?.message);
  const active = await admin.from("vehicle_inspections").select("id").eq("vehicle_id", "b1111111-1111-4111-8111-111111111111").is("archived_at", null);
  assert.equal((active.data as any[]).length, 1);
});
await test("Xe: nhân viên không xem được xe phòng khác", async () => {
  const r = await user.from("vehicles").select("vehicle_code");
  assert.deepEqual((r.data as any[]).map((v) => v.vehicle_code), ["XE-01"]);
});
await test("Cài đặt: admin đổi tên giá trị (cascade sang tài sản)", async () => {
  const s = (await admin.from("settings").select("id").eq("setting_type", "asset_type").eq("setting_value", "MAN_HINH").single()).data as any;
  const r = await admin.rpc("admin_update_setting", { target_setting_id: s.id, target_setting_type: "asset_type", target_setting_value: "MONITOR", target_display_name: "Màn hình" });
  assert.equal(r.error, null, r.error?.message); assert.equal(r.data, 1);
  const n = await user.rpc("admin_update_setting", { target_setting_id: s.id, target_setting_type: "asset_type", target_setting_value: "X", target_display_name: "X" });
  assert.ok(n.error, "nhân viên phải bị chặn");
});
await test("Khảo sát: tạo, mở, gửi phản hồi công khai", async () => {
  const qid = "0f0e0d0c-0b0a-4908-8706-050403020100";
  const id = await admin.rpc("save_company_survey", { target_id: null, target_revision: 0, target_title: "Khảo sát thử", target_description: "", target_questions: [{ id: qid, title: "Bạn hài lòng?", type: "single", required: true, options: ["Có", "Không"] }] });
  assert.equal(id.error, null, id.error?.message);
  const sv = (await admin.from("company_surveys").select("revision, public_token").eq("id", id.data).single()).data as any;
  const open = await admin.rpc("set_company_survey_status", { target_id: id.data, target_revision: sv.revision, target_status: "open" });
  assert.equal(open.error, null, open.error?.message);
  const anon = db({ mode: "anon", userId: null, fragments: null });
  const pub = await anon.rpc("get_public_survey", { target_token: sv.public_token });
  assert.equal((pub.data as any).title, "Khảo sát thử");
  const sub = await anon.rpc("submit_company_survey", { target_token: sv.public_token, target_submission: "1a2b3c4d-1111-4222-8333-444455556666", target_name: "Khách", target_phone: "0901234567", target_email: "", target_answers: { [qid]: "Có" } });
  assert.equal(sub.error, null, sub.error?.message);
  const bad = await anon.rpc("submit_company_survey", { target_token: sv.public_token, target_submission: "1a2b3c4d-1111-4222-8333-444455556667", target_name: "Khách", target_phone: "0901234567", target_email: "", target_answers: { [qid]: "Có lẽ" } });
  assert.equal(bad.error?.message, "SURVEY_INVALID_ANSWERS");
});
await test("Viễn thông: lưu SIM", async () => {
  const r = await admin.rpc("save_telecom_phones", { target_rows: [{ phone: "0901234567", location: "VP", serial: "S1", replacement_phone: "", status: "active", note: "" }] });
  assert.equal(r.error, null, r.error?.message); assert.equal(r.data, 1);
});
await test("Chi phí IT: ghi nhận chi phí + tổng hợp", async () => {
  const cat = (await admin.from("it_cost_categories").select("id").limit(1).single()).data as any;
  const r = await admin.rpc("save_it_cost_entry", { target_data: { request_id: "9a9b9c9d-1111-4222-8333-444455556666", provider: "FPT", recognized_on: "2026-10-15", description: "Internet", status: "confirmed", payment_status: "unpaid", lines: [{ category_id: cat.id, description: "Cước tháng 10", quantity: 1, unit_price: 1000000, amount_before_tax: 1000000, tax_amount: 100000, amount_after_tax: 1100000 }] } });
  assert.equal(r.error, null, r.error?.message);
  const sum = await admin.rpc("it_cost_summary", { target_filter: { year: "2026" } });
  assert.equal((sum.data as any).total, 1100000);
});
await test("Kho VPP: không xuất quá tồn", async () => {
  const item = await admin.from("supply_items").insert({ category: "OFFICE_SUPPLY", item_name: "Giấy A4", unit: "Ram" }).select("id").single();
  assert.equal(item.error, null, item.error?.message);
  const inn = await admin.from("supply_inventory_movements").insert({ item_id: (item.data as any).id, movement_type: "RECEIPT", quantity: 5, unit_price: 60000, movement_date: "2026-11-01" });
  assert.equal(inn.error, null, inn.error?.message);
  const out = await admin.from("supply_inventory_movements").insert({ item_id: (item.data as any).id, movement_type: "ISSUE", quantity: 6, unit_price: 0, movement_date: "2026-11-02" });
  assert.match(out.error?.message ?? "", /Kho không đủ/);
  const bal = (await admin.from("supply_inventory_balances").select("on_hand_quantity").eq("item_id", (item.data as any).id).single()).data as any;
  assert.equal(bal.on_hand_quantity, 5);
});
await test("Quản trị: phân quyền người dùng", async () => {
  const r = await admin.rpc("admin_set_user_access", { target_user_id: USER, target_role_code: "user", target_active: true, target_must_enroll_mfa: false, target_scopes: [{ module: "assets", scope_type: "department", department_id: DEPT_KT }, { module: "vehicles", scope_type: "department", department_id: DEPT_KT }], target_modules: ["equipment", "vehicles", "supplies"] });
  assert.equal(r.error, null, r.error?.message);
  const self = await admin.rpc("admin_set_user_access", { target_user_id: ADMIN, target_role_code: "user", target_active: true, target_must_enroll_mfa: false, target_scopes: [], target_modules: [] });
  assert.ok(self.error, "admin không tự hạ quyền");
});
await test("Xoá mềm tài sản (archive)", async () => {
  const r = await admin.rpc("archive_asset", { target_asset_id: newAssetId });
  assert.equal(r.error, null, r.error?.message);
  const left = await admin.from("assets").select("id").eq("id", newAssetId);
  assert.equal((left.data as any[]).length, 0);
});
console.log(results.join("\n"));
const failed = results.filter((r) => r.startsWith("✗")).length;
console.log(`\n${results.length - failed}/${results.length} đạt`);
await getPool().end();
process.exit(failed ? 1 : 0);
