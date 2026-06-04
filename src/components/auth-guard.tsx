"use client";

import { useEffect, useState } from "react";
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
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (mounted) {
      if (!isAuthenticated) {
        router.replace("/login");
      } else if (requiredRole && user?.role !== requiredRole) {
        router.replace(user?.role === "admin" ? "/admin" : "/partner/survey");
      }
    }
  }, [isAuthenticated, user, requiredRole, router, mounted]);

  // Render children during SSR to avoid hydration mismatch
  // The useEffect will handle redirects on the client side
  if (mounted && !isAuthenticated) return null;
  if (mounted && requiredRole && user?.role !== requiredRole) return null;

  return <>{children}</>;
}
