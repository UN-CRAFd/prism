"use client";

export const dynamic = "force-dynamic";

import { ReportEditor } from "@/components/report-editor/report-editor";

export default function PartnerReportEditorPage() {
  return <ReportEditor mode="partner" basePath="/partner" />;
}
