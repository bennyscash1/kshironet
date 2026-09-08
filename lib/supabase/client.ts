import { createBrowserClient } from "@supabase/ssr";

/**
 * Supabase browser client for use in Client Components.
 * Handles auth (identity/session) only — the app's data layer stays on `pg`
 * (`lib/db/**`) and is unaffected by this client.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
