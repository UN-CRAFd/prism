"use client";

import { useEffect } from "react";
import { WikiShell } from "@/components/partner/wiki/wiki-components";
import { IntroductionPage } from "@/components/partner/wiki/introduction-page";
import { GettingStartedPage } from "@/components/partner/wiki/getting-started-page";
import { ProjectDocumentPage } from "@/components/partner/wiki/project-document-page";
import { ReportEditorPage } from "@/components/partner/wiki/report-editor-page";
import { ReportLifecyclePage } from "@/components/partner/wiki/report-lifecycle-page";
import { SignaturesPage } from "@/components/partner/wiki/signatures-page";
import { CommentsPage } from "@/components/partner/wiki/comments-page";
import { ContactsPage } from "@/components/partner/wiki/contacts-page";
import { ExportingPage } from "@/components/partner/wiki/exporting-page";
import { KeyFeaturesPage } from "@/components/partner/wiki/key-features-page";
import { GlossaryPage } from "@/components/partner/wiki/glossary-page";
import { FaqPage } from "@/components/partner/wiki/faq-page";

// Single long guide page. Each section renders its own <section id="…"> anchor
// (scroll-mt-32 clears the sticky header); the app-sidebar links to those
// anchors. We drive the scroll ourselves so it's smooth on both first load
// (hash present in the URL) and same-page hash changes.
export default function WikiRoute() {
  useEffect(() => {
    const scrollToHash = () => {
      const id = window.location.hash.slice(1);
      if (!id) return;
      document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
    };
    scrollToHash();
    window.addEventListener("hashchange", scrollToHash);
    return () => window.removeEventListener("hashchange", scrollToHash);
  }, []);

  return (
    <WikiShell>
      <div className="divide-y divide-border">
        <IntroductionPage />
        <GettingStartedPage />
        <ProjectDocumentPage />
        <ReportEditorPage />
        <ReportLifecyclePage />
        <SignaturesPage />
        <CommentsPage />
        <ContactsPage />
        <ExportingPage />
        <KeyFeaturesPage />
        <GlossaryPage />
        <FaqPage />
      </div>
    </WikiShell>
  );
}
