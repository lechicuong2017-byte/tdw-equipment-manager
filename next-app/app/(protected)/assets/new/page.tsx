import Link from "next/link";
import { AssetForm } from "@/components/asset-form";
import { PageHeader } from "@/components/page-header";
import { can, requireAccess } from "@/lib/auth";
import type { Department } from "@/lib/types";
import { redirect } from "next/navigation";

export const metadata = { title: "Thêm thiết bị" };

export default async function NewAssetPage() {
  const { supabase, access } = await requireAccess();
  if (!can(access, "assets.manage")) redirect("/assets");

  const { data } = await supabase
    .from("departments")
    .select("id, name")
    .order("name");

  return (
    <>
      <PageHeader
        eyebrow="THIẾT BỊ MỚI"
        title="Thêm thiết bị"
        description="Thiết bị sẽ được lưu trực tiếp vào Supabase và bảo vệ bởi RLS."
        actions={<Link className="secondary-button" href="/assets">Hủy</Link>}
      />
      <section className="panel form-panel">
        <AssetForm departments={(data ?? []) as Department[]} />
      </section>
    </>
  );
}
