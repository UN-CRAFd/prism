"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function ReportEditorRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace("/partner/dashboard"); }, [router]);
  return null;
}
