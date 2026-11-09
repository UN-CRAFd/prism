"use client";

import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { ConfirmDialogUI } from "@/components/ui/confirm-dialog";

// Session inactivity logout. Deliberately separate from LOCK_TIMEOUT_MS in
// src/app/api/prodoc-lock/route.ts and src/components/admin/prodoc-editor-view.tsx
// (the ProDoc edit lock), which is a different feature with a different duration.
const INACTIVITY_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes
const INACTIVITY_WARNING_MS = 14 * 60 * 1000; // warn 1 minute before logout

export type UserRole = "admin" | "partner";

export interface User {
  id: string;
  name: string;
  role: UserRole;
  organization?: string;
  /** partners.id — present for partner logins; absent for admin. */
  partner_id?: number | null;
}

interface AuthContextType {
  user: User | null;
  /** `error` carries the server's message, e.g. how many attempts are left. */
  login: (username: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  logout: () => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [showWarning, setShowWarning] = useState(false);
  const [user, setUser] = useState<User | null>(() => {
    if (typeof window === "undefined") return null;
    // A corrupted/tampered localStorage value must not throw during render — with
    // no error boundary above this provider that would white-screen the whole app.
    // Fall back to logged-out and clear the bad value.
    try {
      const stored = localStorage.getItem("crafd-user");
      return stored ? (JSON.parse(stored) as User) : null;
    } catch {
      localStorage.removeItem("crafd-user");
      return null;
    }
  });

  const lastActivityRef = useRef<number>(Date.now());
  // Mirrors showWarning state so activity listeners (registered once) can read
  // the live value without a stale closure.
  const showWarningRef = useRef(false);

  const login = useCallback(async (username: string, password: string): Promise<{ ok: boolean; error?: string }> => {
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) return { ok: false, error: data?.error };
      if (!data?.user) return { ok: false };
      showWarningRef.current = false;
      setShowWarning(false);
      lastActivityRef.current = Date.now();
      setUser(data.user);
      localStorage.setItem("crafd-user", JSON.stringify(data.user));
      return { ok: true };
    } catch {
      return { ok: false, error: "Network error. Please try again." };
    }
  }, []);

  const logout = useCallback(() => {
    showWarningRef.current = false;
    setShowWarning(false);
    lastActivityRef.current = Date.now();
    setUser(null);
    localStorage.removeItem("crafd-user");
    // Clear the server session cookie too; ignore transport errors on logout.
    fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!user) return;

    lastActivityRef.current = Date.now();

    const updateActivity = () => {
      // While the warning is showing the user must respond explicitly — ignore
      // all passive activity so the clock keeps running and the modal stays up.
      if (showWarningRef.current) return;
      lastActivityRef.current = Date.now();
    };

    const activityEvents = ["mousemove", "mousedown", "keydown", "scroll", "touchstart", "click"] as const;
    const passiveEvents = new Set(["mousemove", "mousedown", "scroll", "touchstart", "click"]);

    for (const event of activityEvents) {
      window.addEventListener(event, updateActivity, passiveEvents.has(event) ? { passive: true } : undefined);
    }

    const interval = setInterval(() => {
      const idle = Date.now() - lastActivityRef.current;
      if (idle >= INACTIVITY_TIMEOUT_MS) {
        logout();
      } else if (idle >= INACTIVITY_WARNING_MS) {
        showWarningRef.current = true;
        setShowWarning(true);
      }
    }, 30_000);

    return () => {
      for (const event of activityEvents) {
        window.removeEventListener(event, updateActivity);
      }
      clearInterval(interval);
    };
  }, [user, logout]);

  // A login ends on the server when the account's password is changed or reset
  // (on any device). Check every minute and whenever the tab regains focus; if
  // it has ended, clear the local user and return to the login page with a note.
  useEffect(() => {
    if (!user) return;
    let stopped = false;
    const check = async () => {
      try {
        const res = await fetch("/api/auth/session", { cache: "no-store" });
        if (res.status === 401 && !stopped) {
          stopped = true;
          setUser(null);
          localStorage.removeItem("crafd-user");
          window.location.replace("/login?signedOut=password");
        }
      } catch { /* offline: try again later */ }
    };
    const interval = setInterval(check, 60_000);
    const onFocus = () => { void check(); };
    window.addEventListener("focus", onFocus);
    return () => {
      stopped = true;
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [user]);

  function handleStaySignedIn() {
    lastActivityRef.current = Date.now();
    showWarningRef.current = false;
    setShowWarning(false);
  }

  return (
    <AuthContext.Provider
      value={{ user, login, logout, isAuthenticated: !!user }}
    >
      {children}
      {showWarning && user && typeof window !== "undefined" &&
        createPortal(
          <ConfirmDialogUI
            options={{
              title: "Session expiring",
              message: "Your session will expire in 1 minute due to inactivity.",
              confirmLabel: "Stay signed in",
              acknowledgement: true,
              blockDismiss: true,
            }}
            onConfirm={handleStaySignedIn}
            onCancel={handleStaySignedIn}
          />,
          document.body
        )}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
