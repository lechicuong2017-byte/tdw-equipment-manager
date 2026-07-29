import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { AccessProfile } from "@/lib/types";

const getAccessSession = cache(async (): Promise<{
  supabase: Awaited<ReturnType<typeof createClient>>;
  access: AccessProfile;
  assuranceLevel: string;
}> => {
  const supabase = await createClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();

  if (claimsError || !claimsData?.claims?.sub) {
    redirect("/login");
  }

  const { data, error } = await supabase.rpc("get_my_access");
  if (error || !data) {
    await supabase.auth.signOut();
    redirect("/login?error=inactive");
  }

  const access = data as AccessProfile;
  const assuranceLevel = String(claimsData.claims.aal || "aal1");
  return {
    supabase,
    access,
    assuranceLevel,
  };
});

export async function requireAccess(options: { allowAal1?: boolean } = {}): Promise<{
  supabase: Awaited<ReturnType<typeof createClient>>;
  access: AccessProfile;
}> {
  const { supabase, access, assuranceLevel } = await getAccessSession();
  const requiresMfa =
    access.roles.includes("admin") || access.must_enroll_mfa;
  if (!options.allowAal1 && requiresMfa && assuranceLevel !== "aal2") {
    redirect("/mfa");
  }

  return {
    supabase,
    access,
  };
}

export function can(access: AccessProfile, permission: string) {
  return (
    access.roles.includes("admin") ||
    access.permissions.includes(permission)
  );
}
