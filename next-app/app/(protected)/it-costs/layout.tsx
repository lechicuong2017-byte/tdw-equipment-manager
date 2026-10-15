import { requireModuleAccess } from "@/lib/auth";
import type { ReactNode } from "react";
import "@/app/it-costs.css";
export default async function Layout({ children }: { children: ReactNode }) {
  await requireModuleAccess("it_costs");
  return children;
}
