"use client";

import { Suspense } from "react";
import { AuthGuard } from "@/components/auth-guard";
import { AppSidebar } from "@/components/app-sidebar";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthGuard requiredRole="admin">
      <Suspense>
        <div className="flex h-screen">
          <AppSidebar />
          <main className="flex-1 overflow-auto bg-background">
            {children}
          </main>
        </div>
      </Suspense>
    </AuthGuard>
  );
}
