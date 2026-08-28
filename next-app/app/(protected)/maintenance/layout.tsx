import { requireModuleAccess } from "@/lib/auth";

export default async function MaintenanceLayout({ children }: { children: React.ReactNode }) {
  await requireModuleAccess("equipment");
  return children;
}
