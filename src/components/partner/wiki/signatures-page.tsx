import { PenLine } from "lucide-react";
import { SectionHeading, InfoBox, Step } from "./wiki-components";

export function SignaturesPage() {
  return (
    <section id="signatures" className="scroll-mt-32 py-12">
      <SectionHeading icon={PenLine}>Signatures &amp; Sign-off</SectionHeading>

      <p className="mb-4 text-sm text-muted-foreground leading-relaxed">
        The Project Document is finalized by a formal sign-off. The{" "}
        <strong>Signatures</strong> tab in the Project Document editor lists your{" "}
        <strong>project contacts</strong> alongside the{" "}
        <strong>CRAF&apos;d Secretariat</strong>. Signing is what turns a
        completed ProDoc into an agreement that can initiate funding
        disbursement.
      </p>

      <div className="mb-6 grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-sm font-semibold text-foreground">
            Your project contacts
          </p>
          <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
            You (the partner) sign on behalf of each project contact. The
            contacts shown here come from the General Information / Contact
            Information you have entered — add or update them there first.
          </p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-sm font-semibold text-foreground">
            CRAF&apos;d Secretariat
          </p>
          <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
            Only CRAF&apos;d can sign the Secretariat line. Until they do, it
            shows &quot;Awaiting signature&quot; — you cannot sign it on their
            behalf, and they cannot sign for your contacts.
          </p>
        </div>
      </div>

      <p className="mb-4 text-sm font-semibold text-foreground">
        How to sign
      </p>
      <div className="space-y-0">
        <Step number={1} title="Make sure your contacts are correct">
          Signatures are generated from your project contacts. Add each person
          who needs to sign in the <strong>Contact Information</strong> section
          (or the ProDoc&apos;s General Information) before you open the
          Signatures tab.
        </Step>
        <Step number={2} title="Open the Signatures tab">
          In the <strong>Project Document</strong>, choose{" "}
          <strong>Signatures</strong> from the section dropdown. Each contact
          appears as a row with a <strong>Sign</strong> button.
        </Step>
        <Step number={3} title="Sign for each contact">
          Click <strong>Sign</strong> on a contact&apos;s row. PRISM stamps the
          signature with the date, and the row turns into a green{" "}
          <strong>Signed</strong> badge. Repeat for every project contact.
        </Step>
        <Step number={4} title="CRAF'd signs the Secretariat line">
          Once your side is complete, the CRAF&apos;d Secretariat signs its own
          line. When all parties have signed, the Project Document is fully
          executed.
        </Step>
        <Step number={5} title="See the signatures on the export">
          Signed names and dates appear in the <strong>Signatures</strong>{" "}
          section of the exported/printed Project Document — see{" "}
          <strong>Exporting &amp; Printing</strong> below.
        </Step>
      </div>

      <div className="mt-2 space-y-3">
        <InfoBox variant="green">
          <strong>Signed in error?</strong> You can remove a signature you made
          by clicking the small <strong>✕</strong> next to the Signed badge and
          confirming. This only applies to your own contact signatures.
        </InfoBox>
        <InfoBox variant="amber">
          <strong>Who signs what:</strong> The partner signs only for project
          contacts; the CRAF&apos;d Secretariat line is signed only by
          CRAF&apos;d. Neither side can sign or remove the other&apos;s
          signatures.
        </InfoBox>
      </div>
    </section>
  );
}
