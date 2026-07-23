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

export function FaqPage() {
  return (
    <div className="flex flex-col min-h-full bg-background">
      <div className="sticky top-0 z-10 bg-neutral-950 text-white px-8 h-32 flex flex-col justify-center">
        <p className="text-neutral-400 text-sm mb-1">PRISM V.0.2</p>
        <h1 className="text-3xl font-bold font-qanelas">Guide</h1>
        <p className="text-neutral-400 text-sm mt-2">How to use the PRISM reporting platform</p>
      </div>

      <div className="flex-1 px-8 py-8">
        <div className="max-w-3xl space-y-6">
          <h2 className="text-xl font-bold pb-3 border-b">FAQ</h2>
          <div className="space-y-6">
            {faqs.map((item) => (
              <div key={item.q} className="border-b pb-6 last:border-b-0 last:pb-0">
                <p className="text-sm font-semibold mb-2">{item.q}</p>
                <p className="text-sm text-muted-foreground leading-relaxed">{item.a}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
