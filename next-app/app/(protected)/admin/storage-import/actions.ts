"use server";

import { revalidatePath } from "next/cache";
import { requireAccess } from "@/lib/auth";
import { importStorageFromSupabase, type StorageImportRun } from "@/lib/db/storage-import";

export type StorageImportState = { error?: string; run?: StorageImportRun };

export async function runStorageImport(_prev: StorageImportState): Promise<StorageImportState> {
  const { access } = await requireAccess();
  if (!access.roles.includes("admin")) return { error: "Chỉ quản trị viên được chuyển file." };
  try {
    const run = await importStorageFromSupabase();
    revalidatePath("/admin/storage-import");
    return { run };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Không thể chuyển file." };
  }
}
