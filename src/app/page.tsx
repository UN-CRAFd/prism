"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";

export default function Home() {
  const { isAuthenticated, user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isAuthenticated) {
      router.replace("/login");
    } else if (user?.role === "admin") {
      router.replace("/admin");
    } else {
      router.replace("/partner/survey");
    }
  }, [isAuthenticated, user, router]);

  return null;
}
