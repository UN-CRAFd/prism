"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth, type UserRole } from "@/lib/auth-context";

export function AuthGuard({
  children,
  requiredRole,
}: {
  children: React.ReactNode;
  requiredRole?: UserRole;
}) {
  const { isAuthenticated, user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isAuthenticated) {
      router.replace("/login");
    } else if (requiredRole && user?.role !== requiredRole) {
      router.replace(user?.role === "admin" ? "/admin" : "/partner/survey");
    }
  }, [isAuthenticated, user, requiredRole, router]);

  if (!isAuthenticated) return null;
  if (requiredRole && user?.role !== requiredRole) return null;

  return <>{children}</>;
}
