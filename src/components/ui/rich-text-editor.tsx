"use client";

import { useCallback, useEffect, useRef } from "react";
import { Bold, Italic, Underline, List, ListOrdered, Link2, Table as TableIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useReadOnly } from "@/components/ui/read-only-context";
import { toDisplayHtml, richTextLength } from "@/lib/richtext";

// ── Rich-text editor ───────────────────────────────────────────────────────────
// A minimal, dependency-free contentEditable editor for the project-document
// narrative + description fields. Emits HTML (stored in the same TEXT columns).
// Formatting via the native execCommand API — deprecated but universally
// supported and sufficient for bold/italic/underline, lists and links here.
//
// Not a fully controlled input: innerHTML is only re-synced when the incoming
// `value` diverges from what we last emitted (e.g. a different project loads),
// so typing never resets the caret. Inherits read-only from ReadOnlyProvider.

type ToolButton = {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  command: "bold" | "italic" | "underline" | "insertUnorderedList" | "insertOrderedList" | "createLink" | "insertTable";
};

const BUTTONS: ToolButton[] = [
  { icon: Bold, label: "Bold", command: "bold" },
  { icon: Italic, label: "Italic", command: "italic" },
  { icon: Underline, label: "Underline", command: "underline" },
  { icon: List, label: "Bullet list", command: "insertUnorderedList" },
  { icon: ListOrdered, label: "Numbered list", command: "insertOrderedList" },
  { icon: Link2, label: "Insert link", command: "createLink" },
  { icon: TableIcon, label: "Insert table", command: "insertTable" },
];

// execCommand has no native table command, so we build the markup and insert it.
// A leading header row plus N body rows; every cell seeded with <br> so it has a
// clickable, editable line. The trailing paragraph gives the caret somewhere to
// land below the table.
function tableHtml(cols: number, rows: number): string {
  const cells = (tag: "th" | "td") => Array.from({ length: cols }, () => `<${tag}><br></${tag}>`).join("");
  const head = `<thead><tr>${cells("th")}</tr></thead>`;
  const body = `<tbody>${Array.from({ length: rows }, () => `<tr>${cells("td")}</tr>`).join("")}</tbody>`;
  return `<table>${head}${body}</table><p><br></p>`;
}

export function RichTextEditor({
  value,
  onChange,
  placeholder,
  className,
  disabled,
  maxChars,
}: {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  // When set, blocks input that would push plain-text length past this limit.
  // Paste into a selection accounts for the removed characters. Paste truncates;
  // regular typing stops at the boundary. A counter is shown below the editor.
  maxChars?: number;
}) {
  const readOnly = useReadOnly();
  const ro = disabled ?? readOnly;
  const ref = useRef<HTMLDivElement>(null);
  // The last HTML we emitted (or initialised with). Guards the sync effect so we
  // don't rewrite innerHTML — and blow away the caret — on our own updates.
  const lastValue = useRef<string>(" ");

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (value !== lastValue.current) {
      el.innerHTML = toDisplayHtml(value);
      lastValue.current = value;
    }
  }, [value]);

  const emit = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    let html = el.innerHTML;
    // Normalise the browser's "empty" states so an emptied field stores "".
    if (html === "<br>" || html === "<div><br></div>" || html === "<p><br></p>") html = "";
    lastValue.current = html;
    onChange(html);
  }, [onChange]);

  const exec = (command: ToolButton["command"]) => {
    if (ro) return;
    ref.current?.focus();
    if (command === "createLink") {
      const raw = window.prompt("Link URL", "https://");
      if (!raw) return;
      // Prepend https:// when the user omits a scheme; leave http(s):// and mailto: alone.
      const url = /^(https?:|mailto:)/i.test(raw) ? raw : `https://${raw}`;
      document.execCommand("createLink", false, url);
      // Stamp target="_blank" and title on the anchor the browser just created.
      // Walk up from the selection's container — execCommand leaves the caret inside the new <a>.
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0) {
        let node: Node | null = sel.getRangeAt(0).commonAncestorContainer;
        while (node && node.nodeName !== "A") node = node.parentNode;
        if (node?.nodeName === "A") {
          (node as HTMLAnchorElement).target = "_blank";
          (node as HTMLAnchorElement).title = url;
        }
      }
    } else if (command === "insertTable") {
      const cols = Math.min(Math.max(Math.round(Number(window.prompt("Number of columns", "3"))) || 0, 1), 10);
      if (!cols) return;
      const rows = Math.min(Math.max(Math.round(Number(window.prompt("Number of rows (excluding header)", "2"))) || 0, 1), 30);
      if (!rows) return;
      document.execCommand("insertHTML", false, tableHtml(cols, rows));
    } else {
      document.execCommand(command, false);
    }
    emit();
  };

  const remaining = maxChars !== undefined ? maxChars - richTextLength(value) : null;

  return (
    <div
      className={cn(
        "rounded-md border border-input bg-transparent focus-within:border-ring focus-within:ring-ring/50 focus-within:ring-[3px] transition-[color,box-shadow] overflow-hidden",
        ro && "opacity-70",
        className
      )}
    >
      {!ro && (
        <div className="flex items-center gap-0.5 border-b border-input bg-muted/40 px-1.5 py-1">
          {BUTTONS.map((b) => (
            <button
              key={b.command}
              type="button"
              // Keep the selection alive: don't let the button steal focus.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => exec(b.command)}
              title={b.label}
              aria-label={b.label}
              className="inline-flex size-7 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            >
              <b.icon className="size-4" />
            </button>
          ))}
        </div>
      )}
      <div
        ref={ref}
        contentEditable={!ro}
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        data-placeholder={placeholder}
        onInput={emit}
        onBlur={emit}
        onMouseOver={(e) => {
          if (ro || !(e.target instanceof Element)) return;
          const a = e.target.closest("a[href]") as HTMLAnchorElement | null;
          if (a && !a.title) a.title = "Cmd/Ctrl+click to open";
        }}
        onClick={(e) => {
          if (!e.metaKey && !e.ctrlKey) return;
          const a = e.target instanceof Element
            ? e.target.closest("a[href]") as HTMLAnchorElement | null
            : null;
          if (!a) return;
          e.preventDefault();
          window.open(a.href, "_blank", "noopener,noreferrer");
        }}
        className={cn(
          "rte-content px-3 py-2 text-sm leading-relaxed outline-none",
          !ro && "cursor-text"
        )}
      />
      {remaining !== null && !ro && (
        <div
          className={cn(
            "px-3 pb-2 text-[11px] text-right tabular-nums select-none",
            remaining < 0 ? "text-destructive font-medium" : "text-muted-foreground"
          )}
        >
          {remaining < 0
            ? `${Math.abs(remaining).toLocaleString()} characters over the limit`
            : `${remaining.toLocaleString()} characters left from ${maxChars!.toLocaleString()} characters limit`}
        </div>
      )}
    </div>
  );
}
