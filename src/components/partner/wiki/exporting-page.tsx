import { Printer } from "lucide-react";
import { SectionHeading, InfoBox, Step } from "./wiki-components";

export function ExportingPage() {
  return (
    <section id="exporting" className="scroll-mt-32 py-12">
      <SectionHeading icon={Printer}>Exporting &amp; Printing</SectionHeading>

      <p className="mb-4 text-sm text-muted-foreground leading-relaxed">
        You can produce a clean PDF of your Project Document at any time — handy
        for internal review, sharing with colleagues, or keeping a signed record
        on file. PRISM renders a properly typeset A4 document with your
        organization&apos;s logo, the full content of every section, and the
        signatures block.
      </p>

      <div className="space-y-0">
        <Step number={1} title="Open the Project Document">
          Go to <strong>Project Document</strong> and make sure the document you
          want is selected in the dropdown at the top.
        </Step>
        <Step number={2} title="Click Print">
          Click the <strong>Print</strong> button next to the dropdown. A
          print-ready view of the document opens in a new tab.
        </Step>
        <Step number={3} title="Save as PDF">
          Your browser&apos;s print dialog appears. Choose{" "}
          <strong>Save as PDF</strong> as the destination (rather than a
          physical printer) and save the file. The dialog may open
          automatically.
        </Step>
      </div>

      <div className="mt-2 space-y-3">
        <InfoBox variant="green">
          <strong>Real, searchable text:</strong> The PDF uses actual document
          fonts, so the text stays selectable and searchable — not a flat image.
          SDG target icons and any signatures are included in the output.
        </InfoBox>
        <InfoBox variant="blue">
          <strong>Sign first for a complete record.</strong> If you export
          before signing, the signature lines print blank. Complete the{" "}
          <strong>Signatures</strong> tab first if you want the signed names and
          dates to appear.
        </InfoBox>
      </div>
    </section>
  );
}
