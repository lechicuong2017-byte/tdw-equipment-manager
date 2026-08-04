"use client";

import Image from "next/image";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { AppIcon } from "@/components/app-icon";

const AssetPreviewContext = createContext<Record<string, string>>({});

export function AssetPreviewProvider({
  assetIds,
  children,
}: {
  assetIds: string[];
  children: ReactNode;
}) {
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const requestKey = useMemo(() => assetIds.join(","), [assetIds]);

  useEffect(() => {
    if (!requestKey) return;
    const controller = new AbortController();

    fetch(`/api/assets/previews?ids=${encodeURIComponent(requestKey)}`, {
      credentials: "same-origin",
      signal: controller.signal,
    })
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then((payload: { previews?: Record<string, string> }) => {
        if (payload.previews) setPreviews(payload.previews);
      })
      .catch(() => undefined);

    return () => controller.abort();
  }, [requestKey]);

  return (
    <AssetPreviewContext.Provider value={previews}>
      {children}
    </AssetPreviewContext.Provider>
  );
}

export function AssetListThumbnail({
  assetId,
  assetName,
}: {
  assetId: string;
  assetName: string;
}) {
  const previews = useContext(AssetPreviewContext);
  const previewUrl = previews[assetId];

  if (!previewUrl) {
    return (
      <span className="asset-list-thumbnail-placeholder" aria-hidden="true">
        <AppIcon name="assets" size={18} />
      </span>
    );
  }

  return (
    <Image
      alt={`Ảnh ${assetName}`}
      className="asset-list-thumbnail"
      height={48}
      loading="lazy"
      src={previewUrl}
      unoptimized
      width={64}
    />
  );
}
