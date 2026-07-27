"use client";

import { useState, useEffect, useRef } from "react";
import {
  BookOpen,
  FileText,
  FileEdit,
  Sparkles,
  HelpCircle,
} from "lucide-react";

const sections = [
  { id: "welcome", label: "Introduction", icon: BookOpen },
  { id: "project-document", label: "Project Document", icon: FileText },
  { id: "report-editor", label: "Report Editor", icon: FileEdit },
  { id: "key-features", label: "Key Features", icon: Sparkles },
  { id: "faq", label: "FAQ", icon: HelpCircle },
];

const prodocSections = [
  {
    name: "General Information",
    what: "Project title, start date, and duration in months. Must be completed before other sections are fully editable.",
    required: "Yes",
  },
  {
    name: "Narratives",
    what: "Several predetermined text boxes — hover each title for detailed instructions. Include hyperlinks to publicly accessible documents.",
    required: "Yes",
  },
  {
    name: "Risk Management",
    what: "Potential risks with category (Social/Environmental, Financial, Operational, Organizational, Political, Regulatory, or Strategic) and mitigating measures.",
    required: "Recommended",
  },
  {
    name: "Indicators",
    what: "Baseline year and value, target year and value for each indicator. Used to track progress in annual reports.",
    required: "Yes",
  },
  {
    name: "Workplan",
    what: "Time frame checkboxes per activity. Auto-populated from the Results Based Management section.",
    required: "Yes",
  },
  {
    name: "Expenditure",
    what: "Budgets per participating organization, disaggregated by year, in compliance with UNSDG Budget Categories. Must equal the total approved project amount.",
    required: "Yes",
  },
];

const reportSections = [
  {
    name: "Overview",
    group: "Qualitative",
    desc: "High-level narrative summary of the project's progress and context during the reporting period.",
  },
  {
    name: "Surveys",
    group: "Qualitative",
    desc: "Data and findings from surveys or assessments conducted as part of the project.",
  },
  {
    name: "Key Achievements",
    group: "Qualitative",
    desc: "Narrative description of the project's most significant outputs and outcomes.",
  },
  {
    name: "Partnerships",
    group: "Qualitative",
    desc: "Description of partnerships formed and their contribution to the project's results.",
  },
  {
    name: "Results",
    group: "Qualitative",
    desc: "Progress against the project's stated results and objectives for the period.",
  },
  {
    name: "Lessons Learned",
    group: "Qualitative",
    desc: "Insights gathered during implementation that could improve future projects or inform adaptive management.",
  },
  {
    name: "External Coverage",
    group: "Qualitative",
    desc: "Media mentions, publications, or external recognition of the project's work.",
  },
  {
    name: "Testimonials",
    group: "Qualitative",
    desc: "Quotes or statements from project beneficiaries, partners, or stakeholders.",
  },
  {
    name: "Risk Management",
    group: "Quantitative",
    desc: "Updated risk register with current statuses and any newly identified risks since the last report.",
  },
  {
    name: "Indicators",
    group: "Quantitative",
    desc: "Actual values achieved for each indicator compared to baseline and targets.",
  },
  {
    name: "Workplan",
    group: "Quantitative",
    desc: "Time frame checkboxes showing which activities were completed during the reporting period.",
  },
  {
    name: "Expenditure",
    group: "Quantitative",
    desc: "Actual expenditure versus approved budget, disaggregated by year and participating organization.",
  },
  {
    name: "Transfers",
    group: "Quantitative",
    desc: "Record of fund transfers between participating organizations or budget lines.",
  },
  {
    name: "Complementary Funding",
    group: "Quantitative",
    desc: "Additional funding sources that contributed to the project beyond the core CRAF'd grant.",
  },
];

const keyFeatures = [
  {
    title: "Report Editor",
    badge: "Core",
    desc: "Complete all 14 sections of your annual or final report in one place. Sections are grouped into Qualitative and Quantitative, with guidance throughout.",
  },
  {
    title: "Project Document",
    badge: "Core",
    desc: "Manage your project's core reference document — general information, narratives, risk register, indicators, workplan, and budget.",
  },
  {
    title: "Auto-save",
    badge: "Convenience",
    desc: "All changes save automatically as you type or leave a field. A brief 'Saved' indicator confirms each write. No manual saving needed.",
  },
  {
    title: "Feedback & Comments",
    badge: "Collaboration",
    desc: "CRAF'd reviewers leave comments on specific sections. These appear on your Home page and link directly to the relevant section.",
  },
  {
    title: "Completion Tracking",
    badge: "Progress",
    desc: "Green checkmarks in the sidebar show which sections are done. A progress bar on the Report Editor landing page shows overall completion.",
  },
  {
    title: "Authorization",
    badge: "Submission",
    desc: "Formally submit your report by accepting the authorization statement. The report locks and enters CRAF'd's review queue.",
  },
  {
    title: "Timeline",
    badge: "Planning",
    desc: "Your Home page shows project start/end dates and report deadlines on a visual timeline, with a pulsing marker for today.",
  },
  {
    title: "Contact Information",
    badge: "Admin",
    desc: "Manage your organization's team contacts, roles, and manager hierarchy through the Contact Information section.",
  },
];

const faqs = [
  {
    q: "I cannot log in — what should I do?",
    a: "Check that you are using the correct username and password provided by CRAF'd. Passwords are case-sensitive. If you have forgotten your password, contact your CRAF'd programme officer to request a reset.",
  },
  {
    q: "I manage more than one project — how do I switch between them?",
    a: "In the Report Editor section of the sidebar, each project and year appears as a separate entry. Click on the one you want to open.",
  },
  {
    q: "A field is greyed out and I cannot edit it — why?",
    a: "Fields become read-only after a report has been authorized, when the field is managed by CRAF'd (e.g. approved budgets, baselines, indicator targets), or when it belongs to a previous year in multi-year tables. Contact CRAF'd if you believe a field should be editable.",
  },
  {
    q: "How do I know my data has been saved?",
    a: "PRISM saves automatically. A 'Saved' indicator appears briefly in the top bar when a change is written. In sections with a Save button, click it after making changes — the button disappears once saved.",
  },
  {
    q: "Who do I contact for help?",
    a: "For questions about report content or deadlines, contact your CRAF'd programme officer. For technical issues with PRISM, contact the CRAF'd data team — include a screenshot and description of the problem.",
  },
];

function SectionHeading({
  id,
  icon: Icon,
  children,
}: {
  id: string;
  icon: React.ElementType;
  children: React.ReactNode;
}) {
  return (
    <h2
      id={id}
      className="mb-4 flex items-center gap-2.5 text-xl font-semibold text-foreground"
    >
      <Icon className="h-5 w-5 shrink-0 text-crafd-yellow" />
      {children}
    </h2>
  );
}

function InfoBox({
  children,
  variant = "blue",
}: {
  children: React.ReactNode;
  variant?: "blue" | "amber" | "green";
}) {
  const colors = {
    blue: "bg-blue-50 border-blue-200 text-blue-900",
    amber: "bg-amber-50 border-amber-200 text-amber-900",
    green: "bg-green-50 border-green-200 text-green-900",
  };
  return (
    <div className={`rounded-lg border px-4 py-3 text-sm ${colors[variant]}`}>
      {children}
    </div>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full bg-neutral-100 px-2.5 py-0.5 text-xs font-medium text-neutral-700">
      {children}
    </span>
  );
}

function Step({
  number,
  title,
  children,
}: {
  number: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-4">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-crafd-yellow text-xs font-bold text-black">
        {number}
      </div>
      <div className="pb-6">
        <p className="font-medium text-foreground">{title}</p>
        <div className="mt-1 text-sm text-muted-foreground leading-relaxed">
          {children}
        </div>
      </div>
    </div>
  );
}

export function WikiPage() {
  const [activeSection, setActiveSection] = useState("welcome");
  const observerRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    const sectionIds = sections.map((s) => s.id);
    const elements = sectionIds
      .map((id) => document.getElementById(id))
      .filter(Boolean) as HTMLElement[];

    observerRef.current = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id);
          }
        }
      },
      { rootMargin: "-20% 0px -70% 0px" },
    );

    elements.forEach((el) => observerRef.current?.observe(el));
    return () => observerRef.current?.disconnect();
  }, []);

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div className="flex flex-col min-h-full bg-background">
      {/* Sticky dark header */}
      <div className="sticky top-0 z-10 bg-neutral-950 text-white px-8 h-32 flex flex-col justify-center">
        <p className="text-neutral-400 text-sm mb-1">PRISM V.0.2</p>
        <h1 className="text-3xl font-bold font-qanelas">Guide</h1>
        <p className="text-neutral-400 text-sm mt-2">
          How to use the PRISM reporting platform
        </p>
      </div>

      <div className="flex-1 px-6 py-8 sm:px-8">
        <div className="flex gap-8">
          {/* Sticky TOC sidebar — offset below the 8rem dark header */}
          <aside className="hidden w-52 shrink-0 lg:block">
            <div className="sticky top-36">
              <p className="mb-3 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                On this page
              </p>
              <nav className="space-y-0.5">
                {sections.map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    onClick={() => scrollTo(id)}
                    className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm transition-colors ${
                      activeSection === id
                        ? "bg-crafd-yellow/15 font-medium text-crafd-yellow"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0" />
                    {label}
                  </button>
                ))}
              </nav>
            </div>
          </aside>

          {/* Main content */}
          <div className="min-w-0 flex-1 space-y-14">

            {/* ── 1. Introduction ───────────────────────── */}
            <section id="welcome" className="scroll-mt-36">
              <div className="mb-6 border-b border-border pb-6">
                <p className="mb-1 text-sm font-medium text-crafd-yellow">
                  Partner Documentation
                </p>
                <h1 className="text-2xl font-bold text-foreground">
                  PRISM Reporting Platform
                </h1>
                <p className="mt-2 text-sm text-muted-foreground">
                  User guide for partners submitting Project Documents and
                  annual reports through the CRAF&apos;d PRISM platform.
                </p>
              </div>

              <SectionHeading id="welcome-body" icon={BookOpen}>
                Introduction
              </SectionHeading>
              <p className="mb-4 text-sm text-muted-foreground leading-relaxed">
                <strong>PRISM</strong> is a tool designed to streamline the
                creation and submission of Project Documents (ProDoc) and
                annual reports. Once your project document is reviewed and
                signed by all relevant parties, it initiates the funding
                disbursements. Please reach out to the CRAF&apos;d Secretariat
                with any questions.
              </p>

              <div className="mb-4 grid gap-3 sm:grid-cols-3">
                {[
                  {
                    title: "Create a ProDoc",
                    desc: "Fill in your project's core reference document with general info, narratives, risks, indicators, workplan, and budget.",
                  },
                  {
                    title: "Submit Reports",
                    desc: "Each year, complete 14 sections covering qualitative progress and quantitative data, then authorize submission.",
                  },
                  {
                    title: "Respond to Feedback",
                    desc: "CRAF'd reviewers may leave comments on specific sections — reply or edit directly from the platform.",
                  },
                ].map(({ title, desc }) => (
                  <div
                    key={title}
                    className="rounded-lg border border-border bg-card p-4"
                  >
                    <p className="text-sm font-semibold text-foreground">
                      {title}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                      {desc}
                    </p>
                  </div>
                ))}
              </div>

              <InfoBox variant="blue">
                For questions about report content or deadlines, contact your
                CRAF&apos;d programme officer at{" "}
                <a
                  href="mailto:crafd@un.org"
                  className="underline underline-offset-2 font-medium"
                >
                  crafd@un.org
                </a>
                .
              </InfoBox>
            </section>

            {/* ── 2. Project Document ───────────────────── */}
            <section id="project-document" className="scroll-mt-36">
              <SectionHeading id="project-document-heading" icon={FileText}>
                Project Document
              </SectionHeading>
              <p className="mb-4 text-sm text-muted-foreground leading-relaxed">
                The <strong>Project Document (ProDoc)</strong> is your
                project&apos;s core reference document. Access it via{" "}
                <strong>Project Document</strong> in the left sidebar. It must
                be completed before your project&apos;s funding disbursement
                can be initiated.
              </p>

              {/* ProDoc sections table */}
              <div className="mb-6 overflow-hidden rounded-lg border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-muted text-xs text-muted-foreground uppercase">
                    <tr>
                      <th className="px-4 py-2.5 text-left">Section</th>
                      <th className="px-4 py-2.5 text-left">What to fill in</th>
                      <th className="px-4 py-2.5 text-left">Required</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {prodocSections.map(({ name, what, required }) => (
                      <tr key={name} className="hover:bg-muted/40">
                        <td className="px-4 py-2.5 font-medium text-foreground whitespace-nowrap align-top">
                          {name}
                        </td>
                        <td className="px-4 py-2.5 text-muted-foreground leading-relaxed">
                          {what}
                        </td>
                        <td className="px-4 py-2.5 align-top">
                          <Badge>{required}</Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Step-by-step walkthrough */}
              <p className="mb-4 text-sm font-semibold text-foreground">
                How to complete the Project Document
              </p>
              <div className="space-y-0">
                <Step number={1} title="Open the Project Document">
                  Click <strong>Project Document</strong> in the sidebar. You
                  will land on the ProDoc overview page showing all sections and
                  their completion status.
                  {/* NOTE: guessed — verify that the ProDoc landing page shows a section overview/status */}
                </Step>
                <Step number={2} title="Fill in General Information first">
                  General Information must be completed before other sections
                  become fully editable. Enter the <strong>Project Title</strong>{" "}
                  (keep it short and meaningful), select the{" "}
                  <strong>Start Date</strong> from the calendar picker, and enter
                  the <strong>Duration</strong> as a numeric value in months.
                </Step>
                <Step number={3} title="Complete the Narratives">
                  The Narratives section contains several predetermined text
                  boxes — hover over each title to see detailed instructions
                  specific to that narrative. Write substantive responses and
                  include hyperlinks to publicly accessible documents where
                  relevant.
                </Step>
                <Step number={4} title="Add risks in Risk Management">
                  Click <strong>Add New Risk</strong> to create a risk entry.
                  For each risk, describe the potential risk, select a category
                  (Social and Environmental, Financial, Operational,
                  Organizational, Political, Regulatory, or Strategic), and
                  describe the measures taken to mitigate it.
                </Step>
                <Step number={5} title="Define your Indicators">
                  For each indicator, enter the{" "}
                  <strong>Baseline Year</strong> (project start) and{" "}
                  <strong>Baseline Value</strong>, then the{" "}
                  <strong>Target Year</strong> (project end) and{" "}
                  <strong>Target Value</strong>. These are used to track
                  progress in annual reports.
                </Step>
                <Step number={6} title="Review the Workplan">
                  The Workplan is auto-populated from the Results Based
                  Management (RBM) section. Tick the{" "}
                  <strong>Time Frame</strong> checkboxes to indicate when each
                  activity will be conducted during the project period.
                  {/* NOTE: guessed — verify that the Workplan is a checkbox-grid interface derived from RBM outputs */}
                </Step>
                <Step number={7} title="Enter Expenditure budgets">
                  Enter budgets per participating organization (if applicable),
                  disaggregated by year, in compliance with UNSDG Budget
                  Categories. All expenditure totals must equal the exact
                  amount approved for the project.
                </Step>
              </div>

              <InfoBox variant="amber">
                <strong>Read-only fields:</strong> Fields managed by CRAF&apos;d
                (e.g. approved budgets, baselines, indicator targets) will appear
                greyed out and cannot be edited. Contact your CRAF&apos;d
                programme officer if you believe a field should be editable.
              </InfoBox>
            </section>

            {/* ── 3. Report Editor ──────────────────────── */}
            <section id="report-editor" className="scroll-mt-36">
              <SectionHeading id="report-editor-heading" icon={FileEdit}>
                Report Editor
              </SectionHeading>
              <p className="mb-4 text-sm text-muted-foreground leading-relaxed">
                The <strong>Report Editor</strong> is where you submit your
                project&apos;s progress, usually on an annual basis. Each year
                your project gets its own report, which CRAF&apos;d opens and
                shares with you via a secure link. Reports have{" "}
                <strong>14 sections</strong> split into Qualitative and
                Quantitative groups.
              </p>

              {/* 14 sections table */}
              <div className="mb-6 overflow-hidden rounded-lg border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-muted text-xs text-muted-foreground uppercase">
                    <tr>
                      <th className="px-4 py-2.5 text-left">Section</th>
                      <th className="px-4 py-2.5 text-left">Group</th>
                      <th className="px-4 py-2.5 text-left">What to fill in</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {reportSections.map(({ name, group, desc }) => (
                      <tr key={name} className="hover:bg-muted/40">
                        <td className="px-4 py-2.5 font-medium text-foreground whitespace-nowrap align-top">
                          {name}
                        </td>
                        <td className="px-4 py-2.5 align-top">
                          <Badge>{group}</Badge>
                        </td>
                        <td className="px-4 py-2.5 text-muted-foreground leading-relaxed">
                          {desc}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Step-by-step */}
              <p className="mb-4 text-sm font-semibold text-foreground">
                How to complete and submit a Report
              </p>
              <div className="space-y-0">
                <Step number={1} title="Receive your report link from CRAF'd">
                  CRAF&apos;d opens a new report for your project and notifies
                  you via email with a secure link. Click the link — it will
                  take you directly into the Report Editor for that reporting
                  period.
                  {/* NOTE: guessed — verify that email + link is the primary notification method, vs. an in-app notification */}
                </Step>
                <Step number={2} title="Navigate sections from the sidebar">
                  In the sidebar under <strong>Report Editor</strong>, you will
                  see each section listed for the open report. Sections with a{" "}
                  <strong>green checkmark</strong> are considered complete. The
                  Report Editor landing page shows an overall completion
                  progress bar.
                </Step>
                <Step number={3} title="Complete the Qualitative sections">
                  Work through Overview, Surveys, Key Achievements,
                  Partnerships, Results, Lessons Learned, External Coverage,
                  and Testimonials. Each is a rich text area — write narrative
                  content describing your project&apos;s progress for the
                  period. PRISM auto-saves as you type or leave a field.
                </Step>
                <Step number={4} title="Complete the Quantitative sections">
                  Fill in Risk Management (updated register), Indicators
                  (actual values vs. targets), Workplan (time frame ticks),
                  Expenditure (actual vs. budget), Transfers, and
                  Complementary Funding. These sections contain structured
                  tables — enter figures in each row.
                </Step>
                <Step number={5} title="Check all sections show a green checkmark">
                  Review the sidebar to confirm every section has a green
                  checkmark. If any are missing, open that section and complete
                  or save the remaining required fields before returning.
                </Step>
                <Step number={6} title="Authorize and submit">
                  Click <strong>Authorize</strong> on the Report Editor landing
                  page. Read and accept the authorization statement — this
                  formally submits your report and grants CRAF&apos;d
                  permission to use submitted materials for outreach purposes.
                  The report locks and enters CRAF&apos;d&apos;s review queue.
                </Step>
                <Step number={7} title="Respond to CRAF'd comments (if any)">
                  During review, CRAF&apos;d may leave comments on specific
                  sections. You will see a notification on your Home page —
                  click it to jump directly to the relevant section. Edit the
                  content or leave a reply, then save. When CRAF&apos;d is
                  satisfied, they will close the report and it becomes
                  permanently read-only.
                </Step>
              </div>

              <div className="space-y-3">
                <InfoBox variant="green">
                  <strong>Auto-save:</strong> PRISM saves your work
                  automatically as you type or leave a field. A &apos;Saved&apos;
                  indicator appears briefly in the top bar. In sections with an
                  explicit Save button, click it after making changes — the
                  button disappears once saved.
                </InfoBox>
                <InfoBox variant="amber">
                  <strong>After authorization:</strong> The report locks and
                  all fields become read-only. Changes can only be made if
                  CRAF&apos;d reopens the report for revision.
                </InfoBox>
              </div>
            </section>

            {/* ── 4. Key Features ───────────────────────── */}
            <section id="key-features" className="scroll-mt-36">
              <SectionHeading id="key-features-heading" icon={Sparkles}>
                Key Features
              </SectionHeading>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {keyFeatures.map((f) => (
                  <div
                    key={f.title}
                    className="rounded-xl border border-border bg-card p-4"
                  >
                    <div className="mb-1.5 flex items-center gap-2">
                      <p className="text-sm font-semibold text-foreground">
                        {f.title}
                      </p>
                      <Badge>{f.badge}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {f.desc}
                    </p>
                  </div>
                ))}
              </div>
            </section>

            {/* ── 5. FAQ ────────────────────────────────── */}
            <section id="faq" className="scroll-mt-36">
              <SectionHeading id="faq-heading" icon={HelpCircle}>
                FAQ
              </SectionHeading>
              <div className="overflow-hidden rounded-lg border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-muted text-xs text-muted-foreground uppercase">
                    <tr>
                      <th className="px-4 py-2.5 text-left w-[38%]">
                        Question
                      </th>
                      <th className="px-4 py-2.5 text-left">Answer</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {faqs.map(({ q, a }) => (
                      <tr key={q} className="hover:bg-muted/40 align-top">
                        <td className="px-4 py-3 font-medium text-foreground leading-snug">
                          {q}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground leading-relaxed">
                          {a}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

          </div>
        </div>
      </div>
    </div>
  );
}
