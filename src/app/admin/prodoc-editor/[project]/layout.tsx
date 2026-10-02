import type { ReactNode } from "react";
import { ProdocEditorView } from "@/components/admin/prodoc-editor-view";

export const dynamic = "force-dynamic";

export default function ProdocEditorProjectLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <ProdocEditorView />
      {children}
    </>
  );
}
