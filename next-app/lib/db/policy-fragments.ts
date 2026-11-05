// Thay cho các hàm phân quyền PostgreSQL (is_admin, has_permission, can_access_asset, ...)
// dùng trong RLS. Mỗi hàm trả về một mẩu SQL MariaDB để ghép vào WHERE.
// Quyền của người dùng được nạp một lần mỗi request (AccessContext) nên phần lớn
// điều kiện được tính sẵn thành hằng 1/0 hoặc danh sách phòng ban.

import { escapeLiteral } from "@/lib/db/sql";

export type ScopeRow = { module: string; scope_type: string; department_id: string | null };

export type AccessContext = {
  userId: string;
  aal: "aal1" | "aal2";
  active: boolean;
  roles: string[];
  /** Quyền thô theo vai trò (chưa lọc theo phân hệ) */
  rolePermissions: string[];
  modules: string[];
  scopes: ScopeRow[];
};

const ALL_MODULES = ["equipment", "vehicles", "supplies", "telecom", "surveys", "it_costs"];

export function permissionSystemModule(permission: string) {
  const p = permission;
  const starts = (prefix: string) => p.startsWith(`${prefix}.`) || p.startsWith(`reports.${prefix}.`);
  if (starts("it_costs")) return "it_costs";
  if (starts("surveys")) return "surveys";
  if (starts("telecom")) return "telecom";
  if (starts("vehicles")) return "vehicles";
  if (starts("supplies")) return "supplies";
  return "equipment";
}

export class PolicyFragments {
  constructor(private readonly ctx: AccessContext) {}

  private bool(v: boolean) {
    return v ? "1" : "0";
  }

  uid() {
    return escapeLiteral(this.ctx.userId);
  }

  get isAdminBool() {
    return this.ctx.active && this.ctx.roles.includes("admin") && this.ctx.aal === "aal2";
  }

  hasRole(role: string) {
    return this.ctx.active && this.ctx.roles.includes(role);
  }

  hasPermissionBool(permission: string) {
    if (this.isAdminBool) return true;
    if (!this.ctx.active) return false;
    // Vai trò admin chưa qua MFA không được dùng quyền admin
    const nonAdminRoles = this.ctx.roles.filter((r) => r !== "admin");
    if (nonAdminRoles.length === 0) return false;
    return (
      this.ctx.rolePermissions.includes(permission) &&
      this.ctx.modules.includes(permissionSystemModule(permission))
    );
  }

  hasModuleBool(module: string) {
    return this.isAdminBool || (ALL_MODULES.includes(module) && this.ctx.active && this.ctx.modules.includes(module));
  }

  isAdmin() {
    return this.bool(this.isAdminBool);
  }

  isActiveUser() {
    return this.bool(this.ctx.active);
  }

  hasPermission(permission: string) {
    return this.bool(this.hasPermissionBool(permission));
  }

  hasRoleCode(role: string) {
    return this.bool(this.hasRole(role));
  }

  private scopesFor(module: string) {
    return this.ctx.scopes.filter((s) => s.module === module);
  }

  /** Điều kiện phạm vi dữ liệu (data_access_scopes) cho một bản ghi có cột phòng ban / người tạo / người phụ trách */
  private scopeSql(module: string, deptExpr: string, ownerExpr: string, assignedSql: string | null) {
    const scopes = this.scopesFor(module);
    if (scopes.some((s) => s.scope_type === "all")) return "1";
    const parts: string[] = [];
    const depts = scopes.filter((s) => s.scope_type === "department" && s.department_id).map((s) => escapeLiteral(s.department_id!));
    if (depts.length) parts.push(`${deptExpr} IN (${depts.join(", ")})`);
    if (assignedSql && scopes.some((s) => s.scope_type === "assigned")) parts.push(assignedSql);
    if (scopes.some((s) => s.scope_type === "owned")) parts.push(`${ownerExpr} = ${this.uid()}`);
    return parts.length ? `(${parts.join(" OR ")})` : "0";
  }

  private responsibleExists(assetExpr: string) {
    return `EXISTS (SELECT 1 FROM asset_responsibles _ar WHERE _ar.asset_id = ${assetExpr} AND _ar.user_id = ${this.uid()} AND _ar.active)`;
  }

  assetScopeMatches(assetIdExpr: string, module: string) {
    if (this.isAdminBool || this.hasRole("manager")) return "1";
    const isUser = this.hasRole("user");
    const parts: string[] = [];
    if (isUser) parts.push(this.responsibleExists(assetIdExpr));
    const direct = this.scopeSql(module, "_a.department_id", "_a.created_by", this.responsibleExists("_a.id"));
    if (direct !== "0") parts.push(`EXISTS (SELECT 1 FROM assets _a WHERE _a.id = ${assetIdExpr} AND ${direct})`);
    // Linh kiện đang lắp trong máy chủ mà người dùng có quyền
    const hostParts: string[] = [];
    if (isUser) hostParts.push(this.responsibleExists("_h.id"));
    const hostScope = this.scopeSql(module, "_h.department_id", "_h.created_by", this.responsibleExists("_h.id"));
    if (hostScope !== "0") hostParts.push(hostScope);
    if (hostParts.length) {
      parts.push(
        `EXISTS (SELECT 1 FROM asset_component_installations _aci JOIN assets _h ON _h.id = _aci.host_asset_id ` +
          `WHERE _aci.component_asset_id = ${assetIdExpr} AND _aci.removed_at IS NULL AND (${hostParts.join(" OR ")}))`,
      );
    }
    return parts.length ? `(${parts.join(" OR ")})` : "0";
  }

  canAccessAsset(assetIdExpr: string, module: string, permission: string) {
    if (!this.hasPermissionBool(permission)) return "0";
    return this.assetScopeMatches(assetIdExpr, module);
  }

  vehicleScopeMatches(vehicleIdExpr: string) {
    if (this.isAdminBool || this.hasRole("manager")) return "1";
    const scope = this.scopeSql("vehicles", "_v.department_id", "_v.created_by", `_v.responsible_user_id = ${this.uid()}`);
    const cond = scope === "0" ? `_v.responsible_user_id = ${this.uid()}` : `(_v.responsible_user_id = ${this.uid()} OR ${scope})`;
    return `EXISTS (SELECT 1 FROM vehicles _v WHERE _v.id = ${vehicleIdExpr} AND _v.deleted_at IS NULL AND ${cond})`;
  }

  canAccessVehicle(vehicleIdExpr: string, permission: string) {
    if (!this.hasPermissionBool(permission)) return "0";
    return this.vehicleScopeMatches(vehicleIdExpr);
  }

  canCreateForDepartment(deptExpr: string, module: string, permission: string) {
    if (!this.hasPermissionBool(permission)) return "0";
    if (this.isAdminBool || this.hasRole("manager")) return "1";
    const scope = this.scopeSql(module, deptExpr, "NULL", null);
    return scope;
  }

  canAccessSoftwareLicense(licenseIdExpr: string, permission: string) {
    if (!this.hasPermissionBool(permission)) return "0";
    if (this.isAdminBool || this.hasRole("manager")) {
      return `EXISTS (SELECT 1 FROM software_licenses _sl WHERE _sl.id = ${licenseIdExpr})`;
    }
    const parts: string[] = [];
    if (this.hasRole("user")) {
      parts.push(`_sl.assigned_user_id = ${this.uid()}`);
      parts.push(`(_sl.assigned_asset_id IS NOT NULL AND ${this.assetScopeMatches("_sl.assigned_asset_id", "software")})`);
    }
    const scope = this.scopeSql(
      "software",
      "(SELECT _sa.department_id FROM assets _sa WHERE _sa.id = _sl.assigned_asset_id)",
      "_sl.created_by",
      `(_sl.assigned_user_id = ${this.uid()} OR ${this.responsibleExists("_sl.assigned_asset_id")})`,
    );
    if (scope !== "0") parts.push(scope);
    if (!parts.length) return "0";
    return `EXISTS (SELECT 1 FROM software_licenses _sl WHERE _sl.id = ${licenseIdExpr} AND (${parts.join(" OR ")}))`;
  }

  supplyRequestScopeMatches(requestIdExpr: string) {
    if (this.isAdminBool || this.hasRole("manager")) return "1";
    const scopes = this.scopesFor("supplies");
    if (!scopes.length) return "1";
    const scope = this.scopeSql("supplies", "_sr.department_id", "_sr.created_by", null);
    if (scope === "1") return "1";
    if (scope === "0") return "0";
    return `EXISTS (SELECT 1 FROM supply_requests _sr WHERE _sr.id = ${requestIdExpr} AND ${scope})`;
  }

  canAccessTollBatch(batchIdExpr: string, permission: string) {
    if (!this.hasPermissionBool(permission)) return "0";
    const vehicleOk = this.canAccessVehicle("_t.vehicle_id", permission);
    if (vehicleOk === "1") {
      return `NOT EXISTS (SELECT 1 FROM vehicle_toll_transactions _t WHERE _t.batch_id = ${batchIdExpr} AND _t.vehicle_id IS NULL)`;
    }
    return `NOT EXISTS (SELECT 1 FROM vehicle_toll_transactions _t WHERE _t.batch_id = ${batchIdExpr} AND (_t.vehicle_id IS NULL OR NOT ${vehicleOk}))`;
  }
}
