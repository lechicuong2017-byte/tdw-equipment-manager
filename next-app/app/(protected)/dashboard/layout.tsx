import { requireModuleAccess } from "@/lib/auth";

export default async function EquipmentDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireModuleAccess("equipment");
  return children;
}
