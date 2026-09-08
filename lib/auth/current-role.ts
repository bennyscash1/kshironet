import { cookies } from "next/headers";
import type { Role } from "@/lib/types";
import { COOKIE_NAME } from "@/lib/auth/constants";

export async function getCurrentRole(): Promise<Role> {
  const store = await cookies();
  const value = store.get(COOKIE_NAME)?.value;
  if (value && (value === "brigade" || value.startsWith("battalion:"))) {
    return value as Role;
  }
  return "brigade";
}

export { COOKIE_NAME };
