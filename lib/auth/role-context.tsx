"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import type { Role } from "@/lib/types";
import { COOKIE_NAME } from "@/lib/auth/constants";

interface RoleContextValue {
  role: Role;
  setRole: (role: Role) => void;
}

const RoleContext = createContext<RoleContextValue>({
  role: "brigade",
  setRole: () => {},
});

function readCookie(): Role {
  if (typeof document === "undefined") return "brigade";
  const match = document.cookie.match(new RegExp(`(?:^|; )${COOKIE_NAME}=([^;]*)`));
  const value = match ? decodeURIComponent(match[1]) : "brigade";
  return value === "brigade" || value.startsWith("battalion:") ? (value as Role) : "brigade";
}

export function RoleProvider({ children }: { children: React.ReactNode }) {
  const [role, setRoleState] = useState<Role>("brigade");

  useEffect(() => {
    setRoleState(readCookie());
  }, []);

  const setRole = useCallback((newRole: Role) => {
    fetch("/api/role", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: newRole }),
    }).finally(() => {
      setRoleState(newRole);
      window.location.reload();
    });
  }, []);

  return <RoleContext.Provider value={{ role, setRole }}>{children}</RoleContext.Provider>;
}

export function useRole() {
  return useContext(RoleContext);
}
