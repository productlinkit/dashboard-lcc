/*
 * Who is signed in to the back office, and what they are allowed to open.
 *
 * The token lives in the API client; this context holds the officer profile and
 * the role's module-access map, so a screen can hide what the role cannot reach
 * instead of letting the user click through to a 403.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { ApiError, tokens } from "./client";
import { auth } from "./endpoints";
import type { ModuleAccess, OfficerSession, OfficerUser } from "./types";

interface SessionValue {
  isAuthenticated: boolean;
  /** True while a stored token is exchanged for a profile on boot. */
  loading: boolean;
  user: OfficerUser | undefined;
  moduleAccess: Record<string, ModuleAccess>;
  /** The caller's role code, or "" when signed out. */
  role: string;
  signIn: (session: OfficerSession) => void;
  signOut: () => Promise<void>;
  /** Does the role reach this module at at least this level? */
  can: (module: string, level?: "view" | "full") => boolean;
}

const SessionContext = createContext<SessionValue | null>(null);

const ACCESS_KEY = "lcc.admin.module_access";

function readCachedAccess(): Record<string, ModuleAccess> {
  try {
    const raw = window.localStorage.getItem(ACCESS_KEY);
    return raw ? (JSON.parse(raw) as Record<string, ModuleAccess>) : {};
  } catch {
    return {};
  }
}

function cacheAccess(access: Record<string, ModuleAccess>) {
  try {
    window.localStorage.setItem(ACCESS_KEY, JSON.stringify(access));
  } catch {
    /* memory-only session */
  }
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setAuthenticated] = useState(tokens.isAuthenticated());
  const [user, setUser] = useState<OfficerUser | undefined>(undefined);
  const [moduleAccess, setModuleAccess] = useState<Record<string, ModuleAccess>>(readCachedAccess);
  const [loading, setLoading] = useState(tokens.isAuthenticated());

  // A stored token survives a reload, so the profile is re-read on boot.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!tokens.isAuthenticated()) {
        setLoading(false);
        return;
      }
      try {
        const me = await auth.me();
        if (cancelled) return;
        setUser(me.user);
        if (me.module_access) {
          const access = me.module_access as Record<string, ModuleAccess>;
          setModuleAccess(access);
          cacheAccess(access);
        }
      } catch (err) {
        // A token that no longer resolves to an account is worse than none: it
        // would leave the shell rendered with nothing behind it.
        if (err instanceof ApiError && (err.isUnauthorized || err.isForbidden)) tokens.clear();
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => tokens.subscribe(setAuthenticated), []);

  const signIn = useCallback((session: OfficerSession) => {
    tokens.set(session.tokens.access_token, session.tokens.refresh_token);
    setUser(session.user);
    setModuleAccess(session.module_access ?? {});
    cacheAccess(session.module_access ?? {});
    setLoading(false);
  }, []);

  const signOut = useCallback(async () => {
    const refresh = tokens.refresh;
    // Revoke server-side, but never trap the user in a session they left.
    if (refresh) await auth.logout(refresh).catch(() => undefined);
    tokens.clear();
    setUser(undefined);
    setModuleAccess({});
    try {
      window.localStorage.removeItem(ACCESS_KEY);
    } catch {
      /* nothing to clear */
    }
  }, []);

  const can = useCallback(
    (module: string, level: "view" | "full" = "view") => {
      const granted = moduleAccess[module];
      if (!granted || granted === "none") return false;
      return level === "view" ? true : granted === "full";
    },
    [moduleAccess],
  );

  const value = useMemo<SessionValue>(
    () => ({
      isAuthenticated,
      loading,
      user,
      moduleAccess,
      role: user?.role_code ?? "",
      signIn,
      signOut,
      can,
    }),
    [isAuthenticated, loading, user, moduleAccess, signIn, signOut, can],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error("useSession must be used inside a SessionProvider");
  return value;
}
