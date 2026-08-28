import { requireModuleAccess } from "@/lib/auth";

export default async function MovementsLayout({ children }: { children: React.ReactNode }) {
  await requireModuleAccess("equipment");
  return children;
}
