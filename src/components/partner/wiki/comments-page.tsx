import { MessageSquare } from "lucide-react";
import { SectionHeading, InfoBox, Step } from "./wiki-components";

export function CommentsPage() {
  return (
    <section id="comments" className="scroll-mt-32 py-12">
      <SectionHeading icon={MessageSquare}>Comments &amp; Feedback</SectionHeading>

      <p className="mb-4 text-sm text-muted-foreground leading-relaxed">
        Review is a conversation. When CRAF&apos;d looks over your Project
        Document or a report, reviewers can attach <strong>comments</strong> to
        specific sections — asking a question, requesting a clarification, or
        pointing out something that needs a change. This section explains how to
        find and respond to them.
      </p>

      <div className="space-y-0">
        <Step number={1} title="Spot the notification">
          New comments surface on your <strong>Home</strong> page. Each entry
          tells you which project, report, and section the comment is on.
        </Step>
        <Step number={2} title="Jump to the section">
          Click the comment to open the exact section it refers to, so you can
          see it in context next to the content being discussed.
        </Step>
        <Step number={3} title="Respond or edit">
          Read the comment, then either <strong>reply</strong> to answer the
          reviewer or <strong>edit the content</strong> to address the request
          — often both. Your edits auto-save as you make them.
        </Step>
        <Step number={4} title="Let the review continue">
          CRAF&apos;d sees your replies and updated content. They may follow up
          with more comments or, once satisfied, close the document. A closed
          document becomes permanently read-only.
        </Step>
      </div>

      <InfoBox variant="blue">
        <strong>Tip:</strong> Keep replies concise and specific — reference the
        change you made (&quot;Updated the baseline figure to 2024 data&quot;)
        so reviewers can confirm quickly. This shortens the review cycle.
      </InfoBox>
    </section>
  );
}
