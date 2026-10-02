import type { ReactNode } from "react";
import { ProdocEditorView } from "@/components/admin/prodoc-editor-view";

export const dynamic = "force-dynamic";

export default function PartnerProdocEditorProjectLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <ProdocEditorView mode="partner" />
      {children}
    </>
  );
}
