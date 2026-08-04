import Link from "next/link";
import { SoftwareForm } from "@/components/software-form";
import { PageHeader } from "@/components/page-header";
import { can, requireAccess } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { deleteSoftwareLicense } from "./actions";

export const metadata = { title: "Phần mềm" };

const softwareStatusLabels: Record<string, string> = {
  ACTIVE: "Đang hoạt động",
  EXPIRING: "Sắp hết hạn",
  EXPIRED: "Đã hết hạn",
  SUSPENDED: "Tạm dừng",
};

type RelatedAsset =
  | { asset_code?: string; asset_name?: string }
  | { asset_code?: string; asset_name?: string }[]
  | null;

function getRelatedAsset(value: RelatedAsset) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function SoftwarePage() {
  const { supabase, access } = await requireAccess();
  const [{ data: assets }, { data: licenses }, { data: softwareNames }] = await Promise.all([
    supabase
      .from("assets")
      .select("id, asset_code, asset_name")
      .is("deleted_at", null)
      .order("asset_code")
      .limit(500),
    supabase
      .from("software_licenses")
      .select(
        "id, software_name, version, license_key_masked, assigned_asset_id, assigned_user_name, expiry_date, status, note, created_at, assets(asset_code, asset_name)",
      )
      .order("expiry_date", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("settings")
      .select("display_name")
      .eq("setting_type", "software_name")
      .eq("active", true)
      .order("sort_order"),
  ]);

  const canManage = can(access, "software.manage");
  const canDelete = can(access, "software.delete");
  const showActions = canManage || canDelete;
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(new Date());

  return (
    <>
      <PageHeader
        eyebrow="PHẦN MỀM"
        title="Bản quyền phần mềm"
        description="Theo dõi phân bổ và thời hạn; khóa thật nằm ngoài bảng nghiệp vụ và không được gửi xuống trình duyệt."
      />

      {canManage ? (
        <SoftwareForm
          assets={assets ?? []}
          softwareNames={(softwareNames ?? []).map((item) => item.display_name)}
        />
      ) : null}

      <section className="panel module-table">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">DANH SÁCH</p>
            <h2>Bản quyền đang quản lý</h2>
          </div>
          <small>{licenses?.length ?? 0} bản ghi</small>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Phần mềm</th>
                <th>Phân bổ</th>
                <th>Khóa đã che</th>
                <th>Hết hạn</th>
                <th>Trạng thái</th>
                {showActions ? <th>Thao tác</th> : null}
              </tr>
            </thead>
            <tbody>
              {(licenses ?? []).map((license) => {
                const asset = getRelatedAsset(license.assets);
                const isExpired = Boolean(
                  license.expiry_date && license.expiry_date < today,
                );
                const displayStatus = isExpired ? "EXPIRED" : license.status;
                return (
                  <tr key={license.id}>
                    <td>
                      {canManage ? (
                        <Link className="asset-name" href={`/software/${license.id}/edit`}>
                          <strong>{license.software_name}</strong>
                          <small>{license.version || "Không ghi phiên bản"}</small>
                        </Link>
                      ) : (
                        <span className="asset-name">
                          <strong>{license.software_name}</strong>
                          <small>{license.version || "Không ghi phiên bản"}</small>
                        </span>
                      )}
                    </td>
                    <td>
                      {license.assigned_asset_id ? (
                        <Link className="asset-name" href={`/assets/${license.assigned_asset_id}`}>
                          <strong>{asset?.asset_code || "Thiết bị"}</strong>
                          <small>{asset?.asset_name}</small>
                        </Link>
                      ) : (
                        <span className="table-secondary">
                          {license.assigned_user_name || "Chưa phân bổ"}
                        </span>
                      )}
                    </td>
                    <td>
                      <code className="masked-key">
                        {license.license_key_masked || "Không lưu"}
                      </code>
                    </td>
                    <td className={isExpired ? "text-danger" : ""}>
                      {formatDate(license.expiry_date)}
                    </td>
                    <td>
                      <span className={`status-pill ${displayStatus === "EXPIRED" ? "status-danger" : ""}`}>
                        {softwareStatusLabels[displayStatus] ?? "Chưa xác định"}
                      </span>
                    </td>
                    {showActions ? (
                      <td>
                        <div className="row-actions">
                          {canManage ? (
                            <Link className="text-button" href={`/software/${license.id}/edit`}>
                              Sửa
                            </Link>
                          ) : null}
                          {canDelete ? (
                            <form action={deleteSoftwareLicense}>
                              <input name="id" type="hidden" value={license.id} />
                              <button className="text-button text-danger" type="submit">Xóa</button>
                            </form>
                          ) : null}
                        </div>
                      </td>
                    ) : null}
                  </tr>
                );
              })}
              {!licenses?.length ? (
                <tr>
                  <td className="empty-cell" colSpan={showActions ? 6 : 5}>
                    Chưa có bản quyền phần mềm.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
