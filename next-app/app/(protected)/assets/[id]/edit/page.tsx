import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AssetForm } from "@/components/asset-form";
import { PageHeader } from "@/components/page-header";
import { can, requireAccess } from "@/lib/auth";
import type {
  Asset,
  AssetResponsible,
  Department,
  ResponsibleUser,
} from "@/lib/types";

export const metadata = { title: "Chỉnh sửa thiết bị" };

type EditAssetProps = {
  params: Promise<{ id: string }>;
};

export default async function EditAssetPage({ params }: EditAssetProps) {
  const { id } = await params;
  const { supabase, access } = await requireAccess();
  if (!can(access, "assets.manage")) redirect(`/assets/${id}`);

  const isAdmin = access.roles.includes("admin");
  const [
    { data: asset },
    { data: departments },
    { data: responsibleUsers },
    { data: responsibles },
  ] = await Promise.all([
    supabase.from("assets").select("*").eq("id", id).is("deleted_at", null).single(),
    supabase.from("departments").select("id, name").order("name"),
    supabase
      .from("profiles")
      .select("id, email, full_name")
      .eq("active", true)
      .order("full_name"),
    supabase
      .from("asset_responsibles")
      .select("user_id, responsibility_role")
      .eq("asset_id", id)
      .eq("active", true),
  ]);
  if (!asset) notFound();

  return (
    <>
      <PageHeader
        eyebrow={asset.asset_code}
        title="Chỉnh sửa thiết bị"
        description={asset.asset_name}
        actions={<Link className="secondary-button" href={`/assets/${id}`}>Hủy</Link>}
      />
      <section className="panel form-panel">
        <AssetForm
          asset={asset as Asset}
          departments={(departments ?? []) as Department[]}
          responsibleUsers={
            isAdmin ? (responsibleUsers ?? []) as ResponsibleUser[] : []
          }
          responsibles={
            isAdmin ? (responsibles ?? []) as AssetResponsible[] : []
          }
        />
      </section>
    </>
  );
}
