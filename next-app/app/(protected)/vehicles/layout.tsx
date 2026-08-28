import { requireModuleAccess } from "@/lib/auth";

export default async function VehiclesLayout({ children }: { children: React.ReactNode }) {
  await requireModuleAccess("vehicles");
  return children;
}
