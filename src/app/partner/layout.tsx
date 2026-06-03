"use client";

import { Suspense } from "react";
import { AuthGuard } from "@/components/auth-guard";
import { AppSidebar } from "@/components/app-sidebar";

export default function PartnerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthGuard requiredRole="partner">
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
