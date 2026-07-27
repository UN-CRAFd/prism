import React from "react";

export function WikiShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col min-h-full bg-background">
      <div className="sticky top-0 z-10 bg-neutral-950 text-white px-8 h-32 flex flex-col justify-center">
        <p className="text-neutral-400 text-sm mb-1">PRISM V.0.2</p>
        <h1 className="text-3xl font-bold font-qanelas">Guide</h1>
        <p className="text-neutral-400 text-sm mt-2">
          How to use the PRISM reporting platform
        </p>
      </div>
      <div className="flex-1 px-8 py-8">
        <div className="max-w-4xl">{children}</div>
      </div>
    </div>
  );
}

export function SectionHeading({
  icon: Icon,
  children,
}: {
  icon: React.ElementType;
  children: React.ReactNode;
}) {
  return (
    <h2 className="mb-4 flex items-center gap-2.5 text-xl font-semibold text-foreground scroll-mt-32">
      <Icon className="h-5 w-5 shrink-0 text-crafd-yellow" />
      {children}
    </h2>
  );
}

export function InfoBox({
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

export function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full bg-neutral-100 px-2.5 py-0.5 text-xs font-medium text-neutral-700">
      {children}
    </span>
  );
}

export function Step({
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
