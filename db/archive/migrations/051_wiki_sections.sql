-- 051_wiki_sections.sql
-- Adds wiki_sections: the partner Guide content, moved out of hardcoded React
-- components into the DB so Program/Fund managers can edit all text and
-- formatting from the admin Guide editor. Each row is one Guide section — a
-- stable `slug` (the on-page anchor id), a `title`, an allowlisted lucide `icon`
-- name, and a rich-text `body_html` (sanitized on write in the API, rendered via
-- toDisplayHtml). Seeded with a faithful HTML conversion of the previous 12
-- hardcoded pages. Idempotent; re-running is a no-op.

SET search_path TO reporting_platform, public;

CREATE TABLE IF NOT EXISTS wiki_sections (
    id          SERIAL       PRIMARY KEY,
    slug        TEXT         NOT NULL UNIQUE,   -- stable anchor id, e.g. "introduction"
    title       TEXT         NOT NULL,
    icon        TEXT,                            -- lucide icon name (allowlisted in src/lib/wiki.ts)
    body_html   TEXT         NOT NULL DEFAULT '',
    sort_order  INTEGER      NOT NULL DEFAULT 0,
    hidden      BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS wiki_sections_order_idx ON wiki_sections(sort_order, id);

DROP TRIGGER IF EXISTS wiki_sections_updated_at ON wiki_sections;
CREATE TRIGGER wiki_sections_updated_at
    BEFORE UPDATE ON wiki_sections
    FOR EACH ROW EXECUTE FUNCTION reporting_platform.set_updated_at();

-- Seed the Guide content (idempotent). Bodies are dollar-quoted ($WIKI$) so the
-- embedded HTML/quotes need no escaping.
INSERT INTO wiki_sections (slug, title, icon, sort_order, body_html) VALUES
('introduction', 'Introduction', 'BookOpen', 1, $WIKI$
<p><strong>PRISM</strong> is a tool designed to streamline the creation and submission of Project Documents (ProDoc) and annual reports. Once your project document is reviewed and signed by all relevant parties, it initiates the funding disbursements. Please reach out to the CRAF'd Secretariat with any questions.</p>
<h3>What you'll do in PRISM</h3>
<ul>
<li><strong>Create a ProDoc</strong> — Fill in your project's core reference document with general info, narratives, risks, indicators, workplan, and budget.</li>
<li><strong>Submit Reports</strong> — Each year, complete 14 sections covering qualitative progress and quantitative data, then authorize your submission.</li>
<li><strong>Respond to Feedback</strong> — CRAF'd reviewers may leave comments on specific sections; reply or edit directly from the platform.</li>
</ul>
<p>For questions about report content or deadlines, contact your CRAF'd programme officer at <a href="mailto:crafd@un.org">crafd@un.org</a>.</p>
$WIKI$),
('getting-started', 'Getting Started', 'LogIn', 2, $WIKI$
<p>PRISM is a web application — there is nothing to install. You access it in your browser using the credentials CRAF'd provides. This section covers logging in and finding your way around.</p>
<ol>
<li><strong>Log in.</strong> Open the PRISM login page and enter the <strong>username</strong> and <strong>password</strong> issued by CRAF'd. Passwords are case-sensitive. If you have lost your credentials, contact your CRAF'd programme officer to request a reset.</li>
<li><strong>Or use a secure link.</strong> When CRAF'd opens a new report for you, they may send a <strong>secure link</strong> by email that takes you straight to that report — no separate login needed. These links are personal to you; please don't forward them.</li>
<li><strong>Get your bearings.</strong> Everything is reached from the <strong>left sidebar</strong>. The panel at the bottom shows your organization and a <strong>log-out</strong> button. Use the small arrow on the sidebar edge to collapse or expand it for more screen space.</li>
</ol>
<h3>What's in the sidebar</h3>
<table><thead><tr><th>Menu item</th><th>What it's for</th></tr></thead><tbody>
<tr><td>Home</td><td>Your landing page — project timeline, upcoming report deadlines, and any comments CRAF'd has left for you.</td></tr>
<tr><td>Project Document</td><td>Your project's core reference document (ProDoc). Complete this before funding can be disbursed.</td></tr>
<tr><td>Report Editor</td><td>Your annual and final reports, grouped by project and year. Where you report progress each period.</td></tr>
<tr><td>Contact Information</td><td>Manage your organization's team contacts, their roles, and email addresses.</td></tr>
<tr><td>Guide</td><td>This documentation. Use the sub-links to jump to any topic.</td></tr>
</tbody></table>
<p><strong>Best experience:</strong> PRISM works in any modern browser (Chrome, Edge, Firefox, or Safari). Keep your browser up to date, and make sure you have a stable internet connection so your work saves reliably.</p>
$WIKI$),
('project-document', 'Project Document', 'FileText', 3, $WIKI$
<p>The <strong>Project Document (ProDoc)</strong> is your project's core reference document. Access it via <strong>Project Document</strong> in the left sidebar. It must be completed before your project's funding disbursement can be initiated.</p>
<table><thead><tr><th>Section</th><th>What to fill in</th><th>Required</th></tr></thead><tbody>
<tr><td>General Information</td><td>Project title, start date, and duration in months. Must be completed before other sections are fully editable.</td><td>Yes</td></tr>
<tr><td>Narratives</td><td>Several predetermined text boxes — hover each title for detailed instructions. Include hyperlinks to publicly accessible documents.</td><td>Yes</td></tr>
<tr><td>Indicators</td><td>The standard CRAF'd indicators are already listed for you — remove any that are not relevant to your project, and add your own custom indicators if needed. For each, set the baseline year and value and the target year and value. Used to track progress in annual reports.</td><td>Yes</td></tr>
<tr><td>Risk Management</td><td>Potential risks with category (Social/Environmental, Financial, Operational, Organizational, Political, Regulatory, or Strategic) and mitigating measures.</td><td>Recommended</td></tr>
<tr><td>Budgets</td><td>Budgets per participating organization, disaggregated by year, in compliance with UNSDG Budget Categories. Must equal the total approved project amount.</td><td>Yes</td></tr>
<tr><td>Workplan</td><td>Quarter-grid showing outcomes, outputs, and activities from RBM as rows. Tick the quarters in which each item is planned.</td><td>Yes</td></tr>
<tr><td>Signatures</td><td>Sign off on the completed Project Document. See the dedicated Signatures section of this guide for the full workflow.</td><td>Yes</td></tr>
</tbody></table>
<h3>How to complete the Project Document</h3>
<ol>
<li><strong>Open the Project Document.</strong> Click <strong>Project Document</strong> in the sidebar. You will open directly into the <strong>General Information</strong> section — complete this first, as other sections depend on it.</li>
<li><strong>Fill in General Information.</strong> Enter the <strong>Project Title</strong> (keep it short and meaningful), select the <strong>Start Date</strong> from the calendar picker, and enter the <strong>Duration</strong> as a numeric value in months.</li>
<li><strong>Complete the Narratives.</strong> The Narratives section contains several predetermined text boxes. Hover over each title to see detailed instructions specific to that narrative. Write substantive responses and include hyperlinks to publicly accessible documents where relevant.</li>
<li><strong>Review your Indicators.</strong> The standard CRAF'd indicators are already listed for you. Delete any that do not apply to your project, and click <strong>Add</strong> to create your own custom indicators — a custom indicator requires a <strong>name</strong>, a <strong>description</strong>, and a <strong>means of verification</strong>. For each indicator, enter the <strong>Baseline Year</strong> (project start) and <strong>Baseline Value</strong>, then the <strong>Target Year</strong> (project end) and <strong>Target Value</strong>. These values are used to track progress in annual reports.</li>
<li><strong>Add risks in Risk Management.</strong> Click <strong>Add New Risk</strong> to create a risk entry. For each risk, describe the potential risk, select a category (Social and Environmental, Financial, Operational, Organizational, Political, Regulatory, or Strategic), and describe the measures taken to mitigate it.</li>
<li><strong>Enter your Budgets.</strong> Enter budgets per participating organization (if applicable), disaggregated by year, in compliance with UNSDG Budget Categories. All budget totals must equal the exact amount approved for the project — the difference between the Grant Size and the Total budget must be under one dollar, or the section flags a budget adjustment.</li>
<li><strong>Fill in the Workplan grid.</strong> The Workplan is a spreadsheet-like grid automatically populated from your Results Based Management (RBM) section. Each <strong>row</strong> corresponds to an outcome, output, or activity from RBM. <strong>Columns</strong> are organized by year and subdivided into quarters (Q1–Q4). Tick the checkbox in each quarter where the corresponding outcome, output, or activity is planned to take place.</li>
<li><strong>Sign off in Signatures.</strong> Once every section is complete, open the <strong>Signatures</strong> tab and sign for your project contacts. The CRAF'd Secretariat signs its own line. See the <strong>Signatures</strong> section of this guide for the full workflow.</li>
</ol>
<p><strong>Read-only fields:</strong> Fields managed by CRAF'd (e.g. approved budgets, baselines, indicator targets) appear greyed out and cannot be edited. Contact your CRAF'd programme officer if you believe a field should be editable.</p>
$WIKI$),
('report-editor', 'Report Editor', 'FileEdit', 4, $WIKI$
<p>The <strong>Report Editor</strong> is where you submit your project's progress, usually on an annual basis. Access it via <strong>Report Editor</strong> in the sidebar — all reports available to you appear there, organized by project and year. CRAF'd may also send you a direct secure link when a new report is opened. Each report has <strong>14 sections</strong> split into Qualitative and Quantitative groups.</p>
<table><thead><tr><th>Section</th><th>Group</th><th>What to fill in</th></tr></thead><tbody>
<tr><td>Overview</td><td>Qualitative</td><td>High-level narrative summary of the project's progress and context during the reporting period.</td></tr>
<tr><td>Surveys</td><td>Qualitative</td><td>Data and findings from surveys or assessments conducted as part of the project.</td></tr>
<tr><td>Key Achievements</td><td>Qualitative</td><td>Narrative description of the project's most significant outputs and outcomes.</td></tr>
<tr><td>Partnerships</td><td>Qualitative</td><td>Description of partnerships formed and their contribution to the project's results.</td></tr>
<tr><td>Results</td><td>Qualitative</td><td>Progress against the project's stated results and objectives for the period.</td></tr>
<tr><td>Lessons Learned</td><td>Qualitative</td><td>Insights gathered during implementation that could improve future projects or inform adaptive management.</td></tr>
<tr><td>External Coverage</td><td>Qualitative</td><td>Media mentions, publications, or external recognition of the project's work.</td></tr>
<tr><td>Testimonials</td><td>Qualitative</td><td>Quotes or statements from project beneficiaries, partners, or stakeholders.</td></tr>
<tr><td>Risk Management</td><td>Quantitative</td><td>Updated risk register with current statuses and any newly identified risks since the last report.</td></tr>
<tr><td>Indicators</td><td>Quantitative</td><td>Actual values achieved for each indicator compared to baseline and targets.</td></tr>
<tr><td>Workplan</td><td>Quantitative</td><td>Quarter-grid showing planned vs. completed activities. Tick the quarters completed during this reporting period.</td></tr>
<tr><td>Expenditure</td><td>Quantitative</td><td>Actual expenditure versus approved budget, disaggregated by year and participating organization.</td></tr>
<tr><td>Transfers</td><td>Quantitative</td><td>Record of fund transfers between participating organizations or budget lines.</td></tr>
<tr><td>Complementary Funding</td><td>Quantitative</td><td>Additional funding sources that contributed to the project beyond the core CRAF'd grant.</td></tr>
</tbody></table>
<h3>How to complete and submit a Report</h3>
<ol>
<li><strong>Open your report.</strong> Click <strong>Report Editor</strong> in the sidebar. Every report available to you is listed there, grouped by project and year — click the one you want to open. If CRAF'd sent you a direct link for a newly opened report, that will take you there too.</li>
<li><strong>Navigate sections from the sidebar.</strong> Once inside a report, the sidebar shows each of its 14 sections. Sections with a <strong>green checkmark</strong> are considered complete by PRISM. The Report Editor landing page shows an overall completion progress bar.</li>
<li><strong>Complete the Qualitative sections.</strong> Work through Overview, Surveys, Key Achievements, Partnerships, Results, Lessons Learned, External Coverage, and Testimonials. Each is a rich text area — write narrative content describing your project's progress for the period. PRISM auto-saves as you type or leave a field.</li>
<li><strong>Complete the Quantitative sections.</strong> Fill in Risk Management (updated register), Indicators (actual values vs. targets), Workplan (quarter-grid ticks), Expenditure (actual vs. budget), Transfers, and Complementary Funding. These sections contain structured tables — enter figures in each row.</li>
<li><strong>Check all sections show a green checkmark.</strong> Review the sidebar to confirm every section has a green checkmark. If any are missing, open that section and complete or save the remaining required fields before returning.</li>
<li><strong>Authorize and submit.</strong> Click <strong>Authorize</strong> on the Report Editor landing page. Read and accept the authorization statement — this formally submits your report and grants CRAF'd permission to use submitted materials for outreach purposes. The report locks and enters CRAF'd's review queue.</li>
<li><strong>Respond to CRAF'd comments (if any).</strong> During review, CRAF'd may leave comments on specific sections. You will see a notification on your Home page — click it to jump directly to the relevant section. Edit the content or leave a reply, then save. When CRAF'd is satisfied, they will close the report and it becomes permanently read-only.</li>
</ol>
<p><strong>Auto-save:</strong> PRISM saves your work automatically as you type or leave a field. A 'Saved' indicator appears briefly in the top bar. In sections with an explicit Save button, click it after making changes — the button disappears once saved.</p>
<p><strong>After authorization:</strong> The report locks and all fields become read-only. Changes can only be made if CRAF'd reopens the report for revision.</p>
$WIKI$),
('report-lifecycle', 'Lifecycle & Statuses', 'Workflow', 5, $WIKI$
<p>Both the Project Document and each report move through the same three statuses. The status decides <strong>who can edit</strong> and appears as a coloured pill at the top of the editor. Knowing where you are in the lifecycle explains why a field might be editable one day and read-only the next.</p>
<table><thead><tr><th>Status</th><th>Who can edit</th><th>What it means</th></tr></thead><tbody>
<tr><td>Open</td><td>You and CRAF'd</td><td>The document is being drafted. You can edit every field that isn't managed by CRAF'd. Fill in all sections here.</td></tr>
<tr><td>Under Review</td><td>CRAF'd only</td><td>You have authorized/submitted, and CRAF'd is reviewing. The document becomes read-only for you while reviewers check it and may leave comments.</td></tr>
<tr><td>Closed</td><td>No one</td><td>The document is finalized and permanently read-only for everyone. Reopening requires CRAF'd to change the status back.</td></tr>
</tbody></table>
<h3>The typical journey</h3>
<ol>
<li><strong>Draft (Open).</strong> You complete every section. PRISM auto-saves as you go and shows a green checkmark for each finished section.</li>
<li><strong>Authorize.</strong> For a report, you click <strong>Authorize</strong> and accept the authorization statement to submit. This formally hands the report to CRAF'd and locks it for you.</li>
<li><strong>Under Review.</strong> CRAF'd checks your submission and may leave comments on specific sections. If changes are needed, they reopen the document so you can respond.</li>
<li><strong>Closed.</strong> Once CRAF'd is satisfied, the document is closed and becomes a permanent, read-only record.</li>
</ol>
<p><strong>Why is this field greyed out?</strong> Most often the document is <strong>Under Review</strong> or <strong>Closed</strong>, so editing is locked. Other fields (approved budgets, baselines, indicator targets, or figures from a previous year) are managed by CRAF'd and stay read-only at all times. Contact your programme officer if you believe something should be editable.</p>
$WIKI$),
('signatures', 'Signatures & Sign-off', 'PenLine', 6, $WIKI$
<p>The Project Document is finalized by a formal sign-off. The <strong>Signatures</strong> tab in the Project Document editor lists your <strong>project contacts</strong> alongside the <strong>CRAF'd Secretariat</strong>. Signing is what turns a completed ProDoc into an agreement that can initiate funding disbursement.</p>
<ul>
<li><strong>Your project contacts.</strong> You (the partner) sign on behalf of each project contact. The contacts shown here come from the General Information / Contact Information you have entered — add or update them there first.</li>
<li><strong>CRAF'd Secretariat.</strong> Only CRAF'd can sign the Secretariat line. Until they do, it shows "Awaiting signature" — you cannot sign it on their behalf, and they cannot sign for your contacts.</li>
</ul>
<h3>How to sign</h3>
<ol>
<li><strong>Make sure your contacts are correct.</strong> Signatures are generated from your project contacts. Add each person who needs to sign in the <strong>Contact Information</strong> section (or the ProDoc's General Information) before you open the Signatures tab.</li>
<li><strong>Open the Signatures tab.</strong> In the <strong>Project Document</strong>, choose <strong>Signatures</strong> from the section dropdown. Each contact appears as a row with a <strong>Sign</strong> button.</li>
<li><strong>Sign for each contact.</strong> Click <strong>Sign</strong> on a contact's row. PRISM stamps the signature with the date, and the row turns into a green <strong>Signed</strong> badge. Repeat for every project contact.</li>
<li><strong>CRAF'd signs the Secretariat line.</strong> Once your side is complete, the CRAF'd Secretariat signs its own line. When all parties have signed, the Project Document is fully executed.</li>
<li><strong>See the signatures on the export.</strong> Signed names and dates appear in the <strong>Signatures</strong> section of the exported/printed Project Document — see <strong>Exporting &amp; Printing</strong> below.</li>
</ol>
<p><strong>Signed in error?</strong> You can remove a signature you made by clicking the small remove control next to the Signed badge and confirming. This only applies to your own contact signatures.</p>
<p><strong>Who signs what:</strong> The partner signs only for project contacts; the CRAF'd Secretariat line is signed only by CRAF'd. Neither side can sign or remove the other's signatures.</p>
$WIKI$),
('comments', 'Comments & Feedback', 'MessageSquare', 7, $WIKI$
<p>Review is a conversation. When CRAF'd looks over your Project Document or a report, reviewers can attach <strong>comments</strong> to specific sections — asking a question, requesting a clarification, or pointing out something that needs a change. This section explains how to find and respond to them.</p>
<ol>
<li><strong>Spot the notification.</strong> New comments surface on your <strong>Home</strong> page. Each entry tells you which project, report, and section the comment is on.</li>
<li><strong>Jump to the section.</strong> Click the comment to open the exact section it refers to, so you can see it in context next to the content being discussed.</li>
<li><strong>Respond or edit.</strong> Read the comment, then either <strong>reply</strong> to answer the reviewer or <strong>edit the content</strong> to address the request — often both. Your edits auto-save as you make them.</li>
<li><strong>Let the review continue.</strong> CRAF'd sees your replies and updated content. They may follow up with more comments or, once satisfied, close the document. A closed document becomes permanently read-only.</li>
</ol>
<p><strong>Tip:</strong> Keep replies concise and specific — reference the change you made ("Updated the baseline figure to 2024 data") so reviewers can confirm quickly. This shortens the review cycle.</p>
$WIKI$),
('contacts', 'Contact Information', 'Contact', 8, $WIKI$
<p>The <strong>Contact Information</strong> section is where you keep your organization's people up to date. These contacts are more than an address book — they populate the project contacts on your Project Document and drive the <strong>Signatures</strong> sign-off, so keeping them accurate matters.</p>
<ul>
<li><strong>Focal Point.</strong> CRAF'd's main point of contact for the project — typically the person accountable for reporting and communication.</li>
<li><strong>Project Manager.</strong> The person running day-to-day delivery of the project.</li>
</ul>
<ol>
<li><strong>Open Contact Information.</strong> Click <strong>Contact Information</strong> in the sidebar to see your organization's current contacts.</li>
<li><strong>Add or edit a person.</strong> Add each person with their <strong>name</strong>, <strong>role/title</strong>, and <strong>email</strong>. Assign a relationship — <strong>Focal Point</strong> or <strong>Project Manager</strong> — where relevant.</li>
<li><strong>Keep it current.</strong> Update contacts whenever someone joins or leaves. Because these feed the ProDoc and the signature lines, an out-of-date list can hold up sign-off.</li>
</ol>
<p>Contacts you add here appear as the <strong>project contacts</strong> on the Project Document and in the Signatures tab. Add everyone who needs to sign <em>before</em> you begin the sign-off.</p>
$WIKI$),
('exporting', 'Exporting & Printing', 'Printer', 9, $WIKI$
<p>You can produce a clean PDF of your Project Document at any time — handy for internal review, sharing with colleagues, or keeping a signed record on file. PRISM renders a properly typeset A4 document with your organization's logo, the full content of every section, and the signatures block.</p>
<ol>
<li><strong>Open the Project Document.</strong> Go to <strong>Project Document</strong> and make sure the document you want is selected in the dropdown at the top.</li>
<li><strong>Click Print.</strong> Click the <strong>Print</strong> button next to the dropdown. A print-ready view of the document opens in a new tab.</li>
<li><strong>Save as PDF.</strong> Your browser's print dialog appears. Choose <strong>Save as PDF</strong> as the destination (rather than a physical printer) and save the file. The dialog may open automatically.</li>
</ol>
<p><strong>Real, searchable text:</strong> The PDF uses actual document fonts, so the text stays selectable and searchable — not a flat image. SDG target icons and any signatures are included in the output.</p>
<p><strong>Sign first for a complete record.</strong> If you export before signing, the signature lines print blank. Complete the <strong>Signatures</strong> tab first if you want the signed names and dates to appear.</p>
$WIKI$),
('key-features', 'Key Features', 'Sparkles', 10, $WIKI$
<table><thead><tr><th>Feature</th><th>Category</th><th>What it does</th></tr></thead><tbody>
<tr><td>Report Editor</td><td>Core</td><td>Complete all 14 sections of your annual or final report in one place. Sections are grouped into Qualitative and Quantitative, with guidance throughout.</td></tr>
<tr><td>Project Document</td><td>Core</td><td>Manage your project's core reference document — general information, narratives, risk register, indicators, workplan, and budget.</td></tr>
<tr><td>Auto-save</td><td>Convenience</td><td>All changes save automatically as you type or leave a field. A brief 'Saved' indicator confirms each write. No manual saving needed.</td></tr>
<tr><td>Feedback &amp; Comments</td><td>Collaboration</td><td>CRAF'd reviewers leave comments on specific sections. These appear on your Home page and link directly to the relevant section.</td></tr>
<tr><td>Completion Tracking</td><td>Progress</td><td>Green checkmarks in the sidebar show which sections are done. A progress bar on the Report Editor landing page shows overall completion.</td></tr>
<tr><td>Authorization</td><td>Submission</td><td>Formally submit your report by accepting the authorization statement. The report locks and enters CRAF'd's review queue.</td></tr>
<tr><td>Timeline</td><td>Planning</td><td>Your Home page shows project start/end dates and report deadlines on a visual timeline, with a pulsing marker for today.</td></tr>
<tr><td>Contact Information</td><td>Admin</td><td>Manage your organization's team contacts, roles, and email addresses through the Contact Information section.</td></tr>
</tbody></table>
$WIKI$),
('glossary', 'Glossary', 'Library', 11, $WIKI$
<table><thead><tr><th>Term</th><th>Meaning</th></tr></thead><tbody>
<tr><td>PRISM</td><td>The CRAF'd reporting platform you are using — where Project Documents and reports are created, submitted, and reviewed.</td></tr>
<tr><td>Project Document (ProDoc)</td><td>Your project's core reference document: general information, narratives, indicators, risks, budgets, workplan, and signatures. Must be completed before funding is disbursed.</td></tr>
<tr><td>Report</td><td>A periodic (usually annual, and a final) submission of your project's progress, organized into 14 qualitative and quantitative sections.</td></tr>
<tr><td>RBM (Results Based Management)</td><td>The framework of outcomes, outputs, and activities your project is built around. The Workplan is generated from it.</td></tr>
<tr><td>Outcome / Output / Activity</td><td>The RBM hierarchy: outcomes are the high-level changes sought, outputs are the deliverables that lead to them, and activities are the concrete tasks that produce outputs.</td></tr>
<tr><td>Indicator</td><td>A measurable value used to track progress. Each has a baseline (starting point) and a target (goal), with a year for each.</td></tr>
<tr><td>Baseline / Target</td><td>The indicator's value at the start of the project (baseline) and the value it aims to reach by the end (target).</td></tr>
<tr><td>SDG Targets</td><td>The specific UN Sustainable Development Goal targets your project contributes to. Each is assigned a focus percentage; together they should total 100%.</td></tr>
<tr><td>UNSDG Budget Categories</td><td>The standard budget-line categories all expenditure must be reported against.</td></tr>
<tr><td>Indirect (support) costs</td><td>The percentage added on top of direct project costs to cover overheads. Applied automatically in the budget totals.</td></tr>
<tr><td>Transfers</td><td>Movements of funds between participating organizations or budget lines, recorded in the report.</td></tr>
<tr><td>Complementary Funding</td><td>Additional funding sources that contributed to the project beyond the core CRAF'd grant.</td></tr>
<tr><td>Focal Point</td><td>The primary contact CRAF'd communicates with for the project, usually accountable for reporting.</td></tr>
<tr><td>Authorize</td><td>The action that formally submits a report to CRAF'd. It locks the report for you and grants CRAF'd permission to use submitted materials for outreach.</td></tr>
<tr><td>Secure link</td><td>A personal email link CRAF'd can send that opens a specific report directly, without a separate login.</td></tr>
<tr><td>Auto-save</td><td>PRISM's automatic saving — changes are written as you type or leave a field, confirmed by a brief 'Saved' indicator.</td></tr>
</tbody></table>
$WIKI$),
('faq', 'FAQ', 'HelpCircle', 12, $WIKI$
<table><thead><tr><th>Question</th><th>Answer</th></tr></thead><tbody>
<tr><td>I cannot log in — what should I do?</td><td>Check that you are using the correct username and password provided by CRAF'd. Passwords are case-sensitive. If you have forgotten your password, contact your CRAF'd programme officer to request a reset.</td></tr>
<tr><td>I manage more than one project — how do I switch between them?</td><td>In the Report Editor section of the sidebar, each project and year appears as a separate entry. Click on the one you want to open.</td></tr>
<tr><td>A field is greyed out and I cannot edit it — why?</td><td>Fields become read-only after a report has been authorized, when the field is managed by CRAF'd (e.g. approved budgets, baselines, indicator targets), or when it belongs to a previous year in multi-year tables. Contact CRAF'd if you believe a field should be editable.</td></tr>
<tr><td>How do I know my data has been saved?</td><td>PRISM saves automatically. A 'Saved' indicator appears briefly in the top bar when a change is written. In sections with a Save button, click it after making changes — the button disappears once saved.</td></tr>
<tr><td>Who do I contact for help?</td><td>For questions about report content or deadlines, contact your CRAF'd programme officer. For technical issues with PRISM, contact the CRAF'd data team — include a screenshot and description of the problem.</td></tr>
</tbody></table>
$WIKI$)
ON CONFLICT (slug) DO NOTHING;
