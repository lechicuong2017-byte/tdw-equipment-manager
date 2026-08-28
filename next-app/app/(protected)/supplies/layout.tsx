import { requireModuleAccess } from "@/lib/auth";

export default async function SuppliesLayout({ children }: { children: React.ReactNode }) {
  await requireModuleAccess("supplies");
  return children;
}
