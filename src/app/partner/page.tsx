"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";
import {
  AlertCircle,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Clock,
  FileText,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────

interface Todo {
  id: string;
  label: string;
  description: string;
  priority: "high" | "medium" | "low";
  href: string;
  done: boolean;
}

interface TimelineEvent {
  date: string;
  label: string;
  description: string;
  type: "deadline" | "submission" | "feedback" | "info";
}

// ── Mock data ──────────────────────────────────────────────────────────────

const TODOS: Todo[] = [
  {
    id: "submit-report",
    label: "Submit 2025 annual report",
    description: "Your report is due by 30 June 2026.",
    priority: "high",
    href: "/partner/dashboard",
    done: false,
  },
  {
    id: "complete-indicators",
    label: "Complete indicator section",
    description: "Several indicators are still missing values.",
    priority: "medium",
    href: "/partner/survey?tab=indicators",
    done: false,
  },
  {
    id: "review-project-info",
    label: "Verify project information",
    description: "Confirm grant size and geographic scope are correct.",
    priority: "low",
    href: "/partner/survey?tab=project-info",
    done: true,
  },
];

const TIMELINE: TimelineEvent[] = [
  {
    date: "1 June 2026",
    label: "Reporting period opens",
    description: "The 2025 annual reporting cycle is now open.",
    type: "info",
  },
  {
    date: "15 June 2026",
    label: "Narrative report deadline",
    description: "All narrative sections must be completed.",
    type: "deadline",
  },
  {
    date: "30 June 2026",
    label: "Final submission deadline",
    description: "All quantitative sections and full report submission.",
    type: "deadline",
  },
  {
    date: "15 July 2026",
    label: "CRAF'd review period",
    description: "Programme team reviews and authorizes submitted reports.",
    type: "feedback",
  },
  {
    date: "31 July 2026",
    label: "Reporting cycle closes",
    description: "Authorization deadline and cycle closure.",
    type: "info",
  },
];

// ── Sub-components ─────────────────────────────────────────────────────────

const priorityConfig = {
  high: { dot: "bg-red-500", text: "text-red-600", label: "High priority" },
  medium: { dot: "bg-amber-400", text: "text-amber-600", label: "Medium priority" },
  low: { dot: "bg-neutral-300", text: "text-neutral-500", label: "Low priority" },
};

const timelineConfig = {
  deadline: { dot: "bg-red-500 ring-red-200", label: "text-red-600" },
  submission: { dot: "bg-green-500 ring-green-200", label: "text-green-700" },
  feedback: { dot: "bg-blue-500 ring-blue-200", label: "text-blue-600" },
  info: { dot: "bg-neutral-400 ring-neutral-200", label: "text-neutral-500" },
};

function TodoItem({ todo, onClick }: { todo: Todo; onClick: () => void }) {
  const cfg = priorityConfig[todo.priority];
  return (
    <button
      onClick={onClick}
      disabled={todo.done}
      className={cn(
        "w-full flex items-start gap-3 rounded-lg px-4 py-3 text-left transition-colors group",
        todo.done
          ? "opacity-50 cursor-default"
          : "hover:bg-accent/60"
      )}
    >
      <div className="mt-0.5 shrink-0">
        {todo.done ? (
          <CheckCircle2 className="size-4 text-green-500" />
        ) : (
          <AlertCircle className={cn("size-4", cfg.text)} />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className={cn("text-sm font-medium", todo.done && "line-through text-muted-foreground")}>
          {todo.label}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">{todo.description}</p>
      </div>
      {!todo.done && (
        <ArrowRight className="size-3.5 shrink-0 mt-0.5 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors" />
      )}
    </button>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function PartnerHomePage() {
  const { user } = useAuth();
  const router = useRouter();

  const greeting = useMemo(() => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 18) return "Good afternoon";
    return "Good evening";
  }, []);

  const pendingCount = TODOS.filter((t) => !t.done).length;

  return (
    <div className="flex flex-col min-h-full bg-background">

      {/* Header */}
      <div className="bg-neutral-950 text-white px-8 py-8">
        <p className="text-neutral-400 text-sm mb-1">{greeting}</p>
        <h1 className="text-3xl font-bold font-qanelas">
          {user?.organization ?? user?.name}
        </h1>
        <p className="text-neutral-400 text-sm mt-2">
          CRAF&apos;d Annual Reporting Platform · Reporting cycle 2025
        </p>
      </div>

      <div className="flex-1 px-8 py-8 max-w-5xl">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 pt-2">

          {/* ── To-do / Notifications ── */}
          <section className="lg:col-span-2 flex flex-col gap-6">
            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-base font-semibold">To-do</h2>
                {pendingCount > 0 && (
                  <span className="inline-flex items-center justify-center rounded-full bg-crafd-yellow text-black text-[10px] font-bold w-5 h-5">
                    {pendingCount}
                  </span>
                )}
              </div>

              <div className="rounded-xl border bg-card overflow-hidden divide-y">
                {TODOS.map((todo) => (
                  <TodoItem
                    key={todo.id}
                    todo={todo}
                    onClick={() => router.push(todo.href)}
                  />
                ))}

                {TODOS.every((t) => t.done) && (
                  <div className="flex items-center gap-3 px-4 py-6 text-center justify-center">
                    <CheckCircle2 className="size-4 text-green-500" />
                    <p className="text-sm text-muted-foreground">All caught up!</p>
                  </div>
                )}
              </div>
            </div>

            {/* ── Quick links ── */}
            <div>
              <h2 className="text-base font-semibold mb-3">Quick access</h2>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: "Reporting", description: "View your reports", icon: FileText, href: "/partner/dashboard" },
                  { label: "Current report", description: "Open 2025 survey", icon: Clock, href: "/partner/survey" },
                ].map(({ label, description, icon: Icon, href }) => (
                  <button
                    key={href}
                    onClick={() => router.push(href)}
                    className="group rounded-xl border bg-card p-4 text-left hover:border-neutral-300 transition-colors flex items-start gap-3"
                  >
                    <div className="rounded-lg bg-muted p-2 shrink-0 group-hover:bg-accent transition-colors">
                      <Icon className="size-4 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">{label}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </section>

          {/* ── Timeline ── */}
          <section className="lg:col-span-1">
            <div className="flex items-center gap-2 mb-3">
              <CalendarDays className="size-4 text-muted-foreground" />
              <h2 className="text-base font-semibold">Timeline</h2>
            </div>

            <div className="relative pl-4">
              {/* vertical line */}
              <div className="absolute left-[7px] top-2 bottom-2 w-px bg-border" />

              <ol className="flex flex-col gap-0">
                {TIMELINE.map((event, i) => {
                  const cfg = timelineConfig[event.type];
                  const today = new Date();
                  const eventDate = new Date(event.date);
                  const isPast = eventDate < today;
                  const isNext =
                    !isPast &&
                    TIMELINE.slice(0, i).every((e) => new Date(e.date) < today);

                  return (
                    <li key={i} className="relative flex gap-4 pb-6 last:pb-0">
                      {/* dot */}
                      <div
                        className={cn(
                          "absolute -left-4 mt-0.5 size-3.5 rounded-full ring-2 ring-white shrink-0",
                          isNext
                            ? cfg.dot
                            : isPast
                            ? "bg-neutral-200 ring-white"
                            : "bg-white border-2 border-neutral-300"
                        )}
                      />
                      <div className="pl-2">
                        <p className={cn(
                          "text-[10px] font-semibold uppercase tracking-wider mb-0.5",
                          isNext ? cfg.label : "text-muted-foreground"
                        )}>
                          {event.date}
                          {isNext && (
                            <span className="ml-1.5 normal-case font-normal text-[9px] bg-crafd-yellow text-black rounded-full px-1.5 py-0.5">
                              Next
                            </span>
                          )}
                        </p>
                        <p className={cn(
                          "text-sm font-medium leading-snug",
                          isPast && !isNext && "text-muted-foreground"
                        )}>
                          {event.label}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
                          {event.description}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </div>
          </section>

        </div>
      </div>
    </div>
  );
}
