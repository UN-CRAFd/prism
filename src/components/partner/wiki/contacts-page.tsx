import { Contact } from "lucide-react";
import { SectionHeading, InfoBox, Step } from "./wiki-components";

export function ContactsPage() {
  return (
    <section id="contacts" className="scroll-mt-32 py-12">
      <SectionHeading icon={Contact}>Contact Information</SectionHeading>

      <p className="mb-4 text-sm text-muted-foreground leading-relaxed">
        The <strong>Contact Information</strong> section is where you keep your
        organization&apos;s people up to date. These contacts are more than an
        address book — they populate the project contacts on your Project
        Document and drive the <strong>Signatures</strong> sign-off, so keeping
        them accurate matters.
      </p>

      <div className="mb-6 grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-sm font-semibold text-foreground">Focal Point</p>
          <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
            CRAF&apos;d&apos;s main point of contact for the project — typically
            the person accountable for reporting and communication.
          </p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-sm font-semibold text-foreground">
            Project Manager
          </p>
          <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
            The person running day-to-day delivery of the project.
          </p>
        </div>
      </div>

      <div className="space-y-0">
        <Step number={1} title="Open Contact Information">
          Click <strong>Contact Information</strong> in the sidebar to see your
          organization&apos;s current contacts.
        </Step>
        <Step number={2} title="Add or edit a person">
          Add each person with their <strong>name</strong>,{" "}
          <strong>role/title</strong>, and <strong>email</strong>. Assign a
          relationship — <strong>Focal Point</strong> or{" "}
          <strong>Project Manager</strong> — where relevant.
        </Step>
        <Step number={3} title="Keep it current">
          Update contacts whenever someone joins or leaves. Because these feed
          the ProDoc and the signature lines, an out-of-date list can hold up
          sign-off.
        </Step>
      </div>

      <InfoBox variant="blue">
        Contacts you add here appear as the <strong>project contacts</strong>{" "}
        on the Project Document and in the Signatures tab. Add everyone who
        needs to sign <em>before</em> you begin the sign-off.
      </InfoBox>
    </section>
  );
}
