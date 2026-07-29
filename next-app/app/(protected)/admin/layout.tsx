import { redirect } from "next/navigation";
import { requireAccess } from "@/lib/auth";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { access } = await requireAccess();
  if (!access.roles.includes("admin")) redirect("/dashboard");
  return children;
}
