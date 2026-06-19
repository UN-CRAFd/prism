"use client";

import React, { createContext, useContext, useState, useCallback } from "react";

export type UserRole = "admin" | "partner";

export interface User {
  id: string;
  name: string;
  role: UserRole;
  organization?: string;
}

interface AuthContextType {
  user: User | null;
  login: (username: string, password: string) => boolean;
  logout: () => void;
  isAuthenticated: boolean;
}

const USERS: Record<string, { password: string; user: User }> = {
  admin: {
    password: "admin",
    user: { id: "admin", name: "CRAF'd Secretariat", role: "admin" },
  },
  acled: {
    password: "acled2024",
    user: {
      id: "acled",
      name: "ACLED",
      role: "partner",
      organization: "ACLED",
    },
  },
  iom: {
    password: "iom2024",
    user: {
      id: "iom",
      name: "IOM",
      role: "partner",
      organization: "IOM",
    },
  },
  fhn: {
    password: "fhn2024",
    user: {
      id: "fhn",
      name: "FHN",
      role: "partner",
      organization: "FHN",
    },
  },
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("crafd-user");
      return stored ? JSON.parse(stored) : null;
    }
    return null;
  });

  const login = useCallback((username: string, password: string): boolean => {
    const entry = USERS[username.toLowerCase()];
    if (entry && entry.password === password) {
      setUser(entry.user);
      localStorage.setItem("crafd-user", JSON.stringify(entry.user));
      return true;
    }
    return false;
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    localStorage.removeItem("crafd-user");
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, login, logout, isAuthenticated: !!user }}
    >
      {children}
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
