"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils";

function isoToDisplay(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}

function digitsToDisplay(digits: string): string {
  const d = digits.slice(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`;
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
}

function displayToIso(display: string): string | null {
  const digits = display.replace(/\D/g, "");
  if (digits.length !== 8) return null;
  const dd = parseInt(digits.slice(0, 2), 10);
  const mm = parseInt(digits.slice(2, 4), 10);
  const yyyy = parseInt(digits.slice(4, 8), 10);
  if (mm < 1 || mm > 12 || dd < 1) return null;
  if (dd > new Date(yyyy, mm, 0).getDate()) return null;
  return `${yyyy}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
}

export function DateInput({
  value,
  onChange,
  disabled,
  className,
  placeholder = "DD/MM/YYYY",
}: {
  value: string;
  onChange: (isoOrEmpty: string) => void;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
}) {
  const [display, setDisplay] = useState(() => isoToDisplay(value));
  const [invalid, setInvalid] = useState(false);
  const focusedRef = useRef(false);
  const hiddenRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!focusedRef.current) {
      setDisplay(isoToDisplay(value));
      setInvalid(false);
    }
  }, [value]);

  function commit(raw: string) {
    const digits = raw.replace(/\D/g, "");
    if (digits.length === 0) {
      setInvalid(false);
      onChange("");
      return;
    }
    const iso = displayToIso(raw);
    if (!iso) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    onChange(iso);
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const digits = e.target.value.replace(/\D/g, "").slice(0, 8);
    const formatted = digitsToDisplay(digits);
    setDisplay(formatted);
    setInvalid(false);
    if (digits.length === 0) {
      onChange("");
    } else if (digits.length === 8) {
      commit(formatted);
    }
  }

  return (
    <div className={cn("relative flex items-center", className)}>
      <input
        type="text"
        inputMode="numeric"
        value={display}
        onChange={handleChange}
        onFocus={() => { focusedRef.current = true; setInvalid(false); }}
        onBlur={() => { focusedRef.current = false; commit(display); }}
        disabled={disabled}
        placeholder={placeholder}
        aria-invalid={invalid || undefined}
        className={cn(
          "placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground flex h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 pr-9 text-base transition-[color,box-shadow] outline-none disabled:pointer-events-none disabled:opacity-50 md:text-sm",
          "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
          invalid && "border-destructive ring-destructive/20 ring-[3px]",
        )}
      />
      <button
        type="button"
        disabled={disabled}
        tabIndex={-1}
        aria-label="Open date picker"
        onClick={() => {
          const el = hiddenRef.current;
          if (!el) return;
          if (typeof (el as HTMLInputElement & { showPicker?: () => void }).showPicker === "function") {
            (el as HTMLInputElement & { showPicker: () => void }).showPicker();
          } else {
            el.focus();
          }
        }}
        className="absolute right-2 flex items-center text-muted-foreground hover:text-foreground disabled:opacity-50"
      >
        <CalendarDays className="size-4" />
      </button>
      <input
        ref={hiddenRef}
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        tabIndex={-1}
        aria-hidden="true"
        className="sr-only"
      />
    </div>
  );
}
