import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Server-only Supabase client used for Storage access. NEVER import this into a
 * Client Component — it carries the service-role key.
 *
 * Why service-role: authorization for every file operation is enforced in the API
 * layer (`requireEditor()` / `canEdit()`), exactly like the `pg` data layer is —
 * so the bucket itself stays private and is never reachable from the browser.
 * Files are only ever handed out as short-lived signed URLs generated per request.
 *
 * This is deliberately separate from `lib/supabase/*` (auth/session only) and from
 * `lib/db/*` (the pg data layer).
 */
let cached: SupabaseClient | undefined;

export function getStorageClient(): SupabaseClient {
  if (cached) return cached;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set. Add it to .env.local");
  }
  if (!serviceRoleKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not set. Add it to .env.local " +
        "(Supabase dashboard → Project Settings → API → service_role key)."
    );
  }

  cached = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}
