import { requireModuleAccess } from "@/lib/auth";

export default async function AssetsLayout({ children }: { children: React.ReactNode }) {
  await requireModuleAccess("equipment");
  return children;
}
