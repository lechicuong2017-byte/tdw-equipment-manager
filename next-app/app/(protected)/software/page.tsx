import Link from "next/link";
import { ConfirmAction, ModalTrigger } from "@/components/app-modal";
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
  | {
      asset_code?: string;
      asset_name?: string;
      asset_group_label?: string;
      asset_type?: string;
      assigned_to_name?: string;
      department_legacy_name?: string;
      departments?: { name?: string } | { name?: string }[] | null;
    }
  | {
      asset_code?: string;
      asset_name?: string;
      asset_group_label?: string;
      asset_type?: string;
      assigned_to_name?: string;
      department_legacy_name?: string;
      departments?: { name?: string } | { name?: string }[] | null;
    }[]
  | null;

type LicenseAssignment = {
  asset_id: string;
  assets: RelatedAsset;
};

function getRelatedAsset(value: RelatedAsset) {
  return Array.isArray(value) ? value[0] : value;
}

function getDepartmentName(asset: ReturnType<typeof getRelatedAsset>) {
  const department = Array.isArray(asset?.departments)
    ? asset.departments[0]
    : asset?.departments;
  return department?.name || asset?.department_legacy_name || "Chưa phân phòng";
}

function SoftwareLicenseDetail({
  assignments,
  expiryDate,
  legacyAssetId,
  legacyAsset,
  status,
  version,
}: {
  assignments: LicenseAssignment[];
  expiryDate: string | null;
  legacyAssetId: string | null;
  legacyAsset: RelatedAsset;
  status: string;
  version: string | null;
}) {
  const assignedAssets = assignments.length
    ? assignments.map((assignment) => ({
        id: assignment.asset_id,
        asset: getRelatedAsset(assignment.assets),
      }))
    : legacyAssetId
      ? [{ id: legacyAssetId, asset: getRelatedAsset(legacyAsset) }]
      : [];

  return (
    <div className="software-license-detail">
      <div className="software-license-detail-summary">
        <div><span>Phiên bản</span><strong>{version || "Không ghi phiên bản"}</strong></div>
        <div><span>Trạng thái</span><strong>{softwareStatusLabels[status] ?? "Chưa xác định"}</strong></div>
        <div><span>Ngày hết hạn</span><strong>{formatDate(expiryDate)}</strong></div>
        <div><span>Đã cấp</span><strong>{assignedAssets.length} thiết bị</strong></div>
      </div>

      <div className="software-license-device-heading">
        <div>
          <p className="eyebrow">THIẾT BỊ ĐƯỢC CẤP</p>
          <h3>Danh sách máy đang sử dụng bản quyền</h3>
        </div>
        <small>{assignedAssets.length} máy</small>
      </div>

      {assignedAssets.length ? (
        <div className="table-wrap software-license-device-table">
          <table>
            <thead>
              <tr>
                <th>Thông tin máy</th>
                <th>Nhóm / loại</th>
                <th>Người sử dụng</th>
                <th>Phòng ban</th>
              </tr>
            </thead>
            <tbody>
              {assignedAssets.map(({ id, asset }) => (
                <tr key={id}>
                  <td>
                    <Link className="asset-name" href={`/assets/${id}`}>
                      <strong>{asset?.asset_name || "Thiết bị"}</strong>
                      <small>{asset?.asset_code || "Chưa có mã thiết bị"}</small>
                    </Link>
                  </td>
                  <td>
                    <strong className="table-secondary">{asset?.asset_group_label || "Chưa có nhóm"}</strong>
                    <small className="table-note">{asset?.asset_type || "Chưa có loại"}</small>
                  </td>
                  <td>{asset?.assigned_to_name || "Chưa gán người sử dụng"}</td>
                  <td>{getDepartmentName(asset)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="empty-state software-license-detail-empty">
          Bản quyền này chưa được gán cho thiết bị nào.
        </p>
      )}
    </div>
  );
}

export default async function SoftwarePage() {
  const { supabase, access } = await requireAccess();
  const [{ data: assets }, { data: licenses }, { data: softwareNames }] = await Promise.all([
    supabase
      .from("assets")
      .select("id, asset_code, asset_name, asset_group, asset_group_label, asset_type, assigned_to_name, department_legacy_name, departments(name)")
      .is("deleted_at", null)
      .neq("status", "DA_THANH_LY")
      .order("asset_code")
      .limit(5000),
    supabase
      .from("software_licenses")
      .select(
        "id, software_name, version, license_key_masked, assigned_asset_id, assigned_user_name, expiry_date, status, note, created_at, assets(asset_code, asset_name, asset_group_label, asset_type, assigned_to_name, department_legacy_name, departments(name)), software_license_assets(asset_id, assets(asset_code, asset_name, asset_group_label, asset_type, assigned_to_name, department_legacy_name, departments(name)))",
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
        actions={canManage ? (
          <ModalTrigger
            description="Khai báo bản quyền mới; admin có thể thêm key mã hóa sau khi lưu."
            eyebrow="PHẦN MỀM"
            size="wide"
            title="Thêm bản quyền phần mềm"
            triggerLabel="+ Thêm phần mềm"
          >
            <SoftwareForm
              assets={assets ?? []}
              softwareNames={(softwareNames ?? []).map((item) => item.display_name)}
            />
          </ModalTrigger>
        ) : null}
      />

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
                const assignments = (license.software_license_assets ?? []) as LicenseAssignment[];
                const isExpired = Boolean(
                  license.expiry_date && license.expiry_date < today,
                );
                const displayStatus = isExpired ? "EXPIRED" : license.status;
                return (
                  <tr key={license.id}>
                    <td>
                      <span className="asset-name">
                        <ModalTrigger
                          description="Thông tin phân bổ bản quyền theo từng máy, người sử dụng và phòng ban."
                          eyebrow="CHI TIẾT BẢN QUYỀN"
                          size="large"
                          title={license.software_name}
                          triggerClassName="software-detail-trigger"
                          triggerLabel={license.software_name}
                        >
                          <SoftwareLicenseDetail
                            assignments={assignments}
                            expiryDate={license.expiry_date}
                            legacyAsset={license.assets as RelatedAsset}
                            legacyAssetId={license.assigned_asset_id}
                            status={displayStatus}
                            version={license.version}
                          />
                        </ModalTrigger>
                        <small>{license.version || "Không ghi phiên bản"}</small>
                      </span>
                    </td>
                    <td>
                      {assignments.length ? (
                        <div className="software-assignment-list">
                          <strong>{assignments.length} thiết bị</strong>
                          {assignments.slice(0, 3).map((assignment) => {
                            const assignedAsset = getRelatedAsset(assignment.assets);
                            return (
                              <Link href={`/assets/${assignment.asset_id}`} key={assignment.asset_id}>
                                {assignedAsset?.asset_code || assignedAsset?.asset_name || "Thiết bị"}
                              </Link>
                            );
                          })}
                          {assignments.length > 3 ? (
                            <small>và {assignments.length - 3} thiết bị khác</small>
                          ) : null}
                        </div>
                      ) : license.assigned_asset_id ? (
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
                          <ModalTrigger
                            description="Thông tin phân bổ bản quyền theo từng máy, người sử dụng và phòng ban."
                            eyebrow="CHI TIẾT BẢN QUYỀN"
                            size="large"
                            title={license.software_name}
                            triggerClassName="text-button"
                            triggerLabel="Xem"
                          >
                            <SoftwareLicenseDetail
                              assignments={assignments}
                              expiryDate={license.expiry_date}
                              legacyAsset={license.assets as RelatedAsset}
                              legacyAssetId={license.assigned_asset_id}
                              status={displayStatus}
                              version={license.version}
                            />
                          </ModalTrigger>
                          {canManage ? (
                            <Link className="text-button" href={`/software/${license.id}/edit`}>
                              Sửa
                            </Link>
                          ) : null}
                          {canDelete ? (
                            <ConfirmAction
                              action={deleteSoftwareLicense}
                              description={`Bản quyền ${license.software_name} sẽ bị xóa khỏi hệ thống. Khóa mã hóa liên quan cũng không còn truy cập được.`}
                              fields={{ id: license.id }}
                              title="Xóa bản quyền phần mềm?"
                            />
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
