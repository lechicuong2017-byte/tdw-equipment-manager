import { Suspense } from "react";
import {
  ActionToastProvider,
  ActionUrlToast,
} from "@/components/action-toast";
import { ProtectedShell } from "@/components/protected-shell";
import { requireAccess } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { access } = await requireAccess();

  return (
    <ActionToastProvider>
      <Suspense fallback={null}>
        <ActionUrlToast />
      </Suspense>
      <ProtectedShell access={access}>{children}</ProtectedShell>
    </ActionToastProvider>
  );
}
