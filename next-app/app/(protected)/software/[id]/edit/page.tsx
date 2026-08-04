import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { PageHeader } from "@/components/page-header";
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

  const [{ data: license }, { data: assets }, { data: softwareNames }] = await Promise.all([
    supabase
      .from("software_licenses")
      .select(
        "id, software_name, version, license_key_masked, license_secret_ref, assigned_asset_id, assigned_user_name, expiry_date, status, note",
      )
      .eq("id", parsedId.data)
      .maybeSingle(),
    supabase
      .from("assets")
      .select("id, asset_code, asset_name")
      .is("deleted_at", null)
      .order("asset_code")
      .limit(500),
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
    assigned_asset_id: license.assigned_asset_id,
    assigned_user_name: license.assigned_user_name,
    expiry_date: license.expiry_date,
    status: license.status,
    note: license.note,
  };

  return (
    <>
      <PageHeader
        eyebrow="PHẦN MỀM"
        title="Sửa bản quyền"
        description="Cập nhật thông tin phân bổ, thời hạn và key bản quyền được mã hóa."
        actions={<Link className="secondary-button" href="/software">Hủy</Link>}
      />
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
    </>
  );
}
