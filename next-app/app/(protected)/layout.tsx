import { Sidebar } from "@/components/sidebar";
import { requireAccess } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { access } = await requireAccess();

  return (
    <div className="app-shell">
      <Sidebar access={access} />
      <main className="app-main">{children}</main>
    </div>
  );
}
