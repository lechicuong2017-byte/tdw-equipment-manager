import { requireModuleAccess } from "@/lib/auth";

export default async function ReportsLayout({ children }: { children: React.ReactNode }) {
  await requireModuleAccess("equipment");
  return children;
}
