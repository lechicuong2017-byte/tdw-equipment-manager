import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { ModalPage } from "@/components/app-modal";
import { SoftwareEditForm } from "@/components/software-edit-form";
import { SoftwareLicenseSecretPanel } from "@/components/software-license-secret-panel";
import { can, requireAccess } from "@/lib/auth";

export const metadata = { title: "Sửa bản quyền phần mềm" };

type EditSoftwarePageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditSoftwarePage({ params }: EditSoftwarePageProps) {
  const parsedId = z.uuid().safeParse((await params).id);
  if (!parsedId.success) notFound();

  const { supabase, access } = await requireAccess();
  if (!can(access, "software.manage")) redirect("/software");
  const isAdmin = access.roles.includes("admin");

  const [
    { data: license },
    { data: assets },
    { data: assignments },
    { data: softwareNames },
  ] = await Promise.all([
    supabase
      .from("software_licenses")
      .select(
        "id, software_name, version, license_key_masked, license_secret_ref, assigned_asset_id, assigned_user_name, expiry_date, status, note",
      )
      .eq("id", parsedId.data)
      .maybeSingle(),
    supabase
      .from("assets")
      .select("id, asset_code, asset_name, asset_group, asset_group_label, asset_type, department_legacy_name, departments(name)")
      .is("deleted_at", null)
      .neq("status", "DA_THANH_LY")
      .order("asset_code")
      .limit(5000),
    supabase
      .from("software_license_assets")
      .select("asset_id")
      .eq("license_id", parsedId.data)
      .order("created_at"),
    supabase
      .from("settings")
      .select("display_name")
      .eq("setting_type", "software_name")
      .eq("active", true)
      .order("sort_order"),
  ]);

  if (!license) notFound();

  const editableLicense = {
    id: license.id,
    software_name: license.software_name,
    version: license.version,
    assigned_asset_ids: assignments?.length
      ? assignments.map((assignment) => assignment.asset_id)
      : license.assigned_asset_id
        ? [license.assigned_asset_id]
        : [],
    assigned_user_name: license.assigned_user_name,
    expiry_date: license.expiry_date,
    status: license.status,
    note: license.note,
  };

  return (
    <ModalPage
      closeHref="/software"
      description="Cập nhật thông tin phân bổ, thời hạn và key bản quyền được mã hóa."
      eyebrow="PHẦN MỀM"
      size="wide"
      title="Sửa bản quyền"
    >
      <div className="app-modal-stack">
        <SoftwareEditForm
          assets={assets ?? []}
          license={editableLicense}
          softwareNames={(softwareNames ?? []).map((item) => item.display_name)}
        />
        {isAdmin ? (
          <SoftwareLicenseSecretPanel
            hasEncryptedSecret={license.license_secret_ref === "encrypted:v1"}
            licenseId={license.id}
            maskedKey={license.license_key_masked}
          />
        ) : null}
      </div>
    </ModalPage>
  );
}
