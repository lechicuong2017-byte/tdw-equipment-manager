import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAccess } from "@/lib/auth";

const assetIdsSchema = z.array(z.uuid()).min(1).max(20);

export async function GET(request: Request) {
  const rawIds = new URL(request.url).searchParams.get("ids") ?? "";
  const parsed = assetIdsSchema.safeParse(
    Array.from(new Set(rawIds.split(",").filter(Boolean))),
  );
  if (!parsed.success) {
    return NextResponse.json({ previews: {} }, { status: 400 });
  }

  const { supabase } = await requireAccess();
  const { data: media } = await supabase
    .from("media_files")
    .select("asset_id,object_path,thumbnail_path,sort_order,created_at")
    .in("asset_id", parsed.data)
    .eq("owner_type", "ASSET")
    .order("sort_order")
    .order("created_at")
    .limit(200);

  const firstMediaByAsset = new Map<
    string,
    { object_path: string; thumbnail_path: string | null }
  >();
  for (const item of media ?? []) {
    if (!firstMediaByAsset.has(item.asset_id)) firstMediaByAsset.set(item.asset_id, item);
  }

  const pathEntries = Array.from(firstMediaByAsset.entries()).map(([assetId, item]) => [
    assetId,
    item.thumbnail_path || item.object_path,
  ] as const);
  const paths = pathEntries.map(([, path]) => path);
  const { data: signedUrls } = paths.length
    ? await supabase.storage.from("asset-media").createSignedUrls(paths, 300)
    : { data: [] };
  const signedUrlByPath = new Map(
    (signedUrls ?? []).map((item) => [item.path, item.signedUrl]),
  );
  const previews = Object.fromEntries(
    pathEntries.flatMap(([assetId, path]) => {
      const signedUrl = signedUrlByPath.get(path);
      return signedUrl ? [[assetId, signedUrl]] : [];
    }),
  );

  return NextResponse.json(
    { previews },
    { headers: { "Cache-Control": "private, max-age=240" } },
  );
}
