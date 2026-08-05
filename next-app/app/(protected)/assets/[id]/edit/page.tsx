import { notFound, redirect } from "next/navigation";
import { AssetForm } from "@/components/asset-form";
import { ModalPage } from "@/components/app-modal";
import { can, requireAccess } from "@/lib/auth";
import { safeAssetsReturnTo } from "@/lib/asset-navigation";
import type {
  Asset,
  AssetResponsible,
  Department,
  ResponsibleUser,
  Setting,
} from "@/lib/types";

export const metadata = { title: "Chỉnh sửa thiết bị" };

type EditAssetProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ returnTo?: string }>;
};

export default async function EditAssetPage({ params, searchParams }: EditAssetProps) {
  const { id } = await params;
  const returnTo = safeAssetsReturnTo((await searchParams).returnTo);
  const { supabase, access } = await requireAccess();
  if (!can(access, "assets.manage")) redirect(`/assets/${id}`);

  const isAdmin = access.roles.includes("admin");
  const [
    { data: asset },
    { data: departments },
    { data: responsibleUsers },
    { data: responsibles },
    { data: settings },
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
    supabase
      .from("settings")
      .select("id,setting_type,setting_value,display_name,sort_order,active")
      .in("setting_type", ["asset_group", "asset_type", "status"])
      .order("sort_order"),
  ]);
  if (!asset) notFound();

  return (
    <ModalPage
      closeHref={returnTo ?? `/assets/${id}`}
      description={asset.asset_name}
      eyebrow={asset.asset_code}
      size="wide"
      title="Chỉnh sửa thiết bị"
    >
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
          settings={(settings ?? []) as Setting[]}
          returnTo={returnTo ?? undefined}
        />
      </section>
    </ModalPage>
  );
}
