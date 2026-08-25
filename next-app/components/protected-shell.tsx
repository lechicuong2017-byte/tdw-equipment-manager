"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import type { AccessProfile } from "@/lib/types";
import { Sidebar } from "@/components/sidebar";

export function ProtectedShell({ access, children }: { access: AccessProfile; children: ReactNode }) {
  const pathname = usePathname();
  const isModulePicker = pathname === "/modules";

  if (isModulePicker) {
    return <main className="module-picker-main">{children}</main>;
  }

  return (
    <div className="app-shell">
      <Sidebar access={access} />
      <main className="app-main">{children}</main>
    </div>
  );
}
