import { requireModuleAccess } from "@/lib/auth";

export default async function SoftwareLayout({ children }: { children: React.ReactNode }) {
  await requireModuleAccess("equipment");
  return children;
}
