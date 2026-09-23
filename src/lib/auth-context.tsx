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
  login: (username: string, password: string) => Promise<boolean>;
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

  const login = useCallback(async (username: string, password: string): Promise<boolean> => {
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (!res.ok) return false;
      const data = await res.json();
      if (!data?.user) return false;
      setUser(data.user);
      localStorage.setItem("crafd-user", JSON.stringify(data.user));
      return true;
    } catch {
      return false;
    }
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    localStorage.removeItem("crafd-user");
    // Clear the server session cookie too; ignore transport errors on logout.
    fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
  }, []);

  const lastActivityRef = useRef<number>(Date.now());
  // Mirrors showWarning state so activity listeners (registered once) can read
  // the live value without a stale closure.
  const showWarningRef = useRef(false);

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
