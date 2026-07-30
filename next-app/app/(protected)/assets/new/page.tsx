import Link from "next/link";
import { AssetForm } from "@/components/asset-form";
import { PageHeader } from "@/components/page-header";
import { can, requireAccess } from "@/lib/auth";
import type { Department } from "@/lib/types";
import { redirect } from "next/navigation";

export const metadata = { title: "Thêm tài sản" };

type NewAssetPageProps = {
  searchParams: Promise<{ kind?: string }>;
};

export default async function NewAssetPage({ searchParams }: NewAssetPageProps) {
  const defaultKind = (await searchParams).kind === "component" ? "COMPONENT" : "DEVICE";
  const isComponent = defaultKind === "COMPONENT";
  const { supabase, access } = await requireAccess();
  if (!can(access, "assets.manage")) redirect("/assets");

  const { data } = await supabase
    .from("departments")
    .select("id, name")
    .order("name");

  return (
    <>
      <PageHeader
        eyebrow={isComponent ? "LINH KIỆN MỚI" : "THIẾT BỊ MỚI"}
        title={isComponent ? "Thêm linh kiện" : "Thêm thiết bị"}
        description={`${isComponent ? "Linh kiện" : "Thiết bị"} sẽ được lưu trực tiếp vào Supabase và bảo vệ bởi RLS.`}
        actions={<Link className="secondary-button" href="/assets">Hủy</Link>}
      />
      <section className="panel form-panel">
        <AssetForm
          defaultKind={defaultKind}
          departments={(data ?? []) as Department[]}
        />
      </section>
    </>
  );
}
