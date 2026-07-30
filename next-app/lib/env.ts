const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabasePublishableKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export function hasSupabaseEnv() {
  return Boolean(supabaseUrl?.trim() && supabasePublishableKey?.trim());
}

export function getSupabaseEnv() {
  if (!hasSupabaseEnv()) {
    throw new Error(
      "Supabase chưa được cấu hình. Hãy thiết lập NEXT_PUBLIC_SUPABASE_URL và NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.",
    );
  }

  return {
    url: supabaseUrl!,
    publishableKey: supabasePublishableKey!,
  };
}
