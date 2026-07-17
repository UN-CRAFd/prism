"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Image from "next/image";
import { Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

// Magic-link landing. The link never logs anyone in on its own: on first use the
// visitor sets a password (which becomes the partner's password); afterwards they
// must re-enter it. On success we write the session to localStorage and hard-nav
// so the root AuthProvider re-initialises from storage (a soft push would leave
// the in-memory user null and the guard would bounce to /login).

type Phase = "loading" | "setup" | "verify" | "dead";

export default function MagicLinkPage() {
  const params = useParams<{ token: string }>();
  const router = useRouter();
  const token = Array.isArray(params.token) ? params.token[0] : params.token;

  const [phase, setPhase] = useState<Phase>("loading");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!token) {
      setPhase("dead");
      setError("This link is invalid.");
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/auth/magic?token=${encodeURIComponent(token)}`);
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) {
          setPhase("dead");
          setError(data?.error || "This link is invalid or has expired.");
          return;
        }
        setName(data.name || "");
        setPhase(data.needsSetup ? "setup" : "verify");
      } catch {
        if (!cancelled) {
          setPhase("dead");
          setError("Something went wrong opening this link.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (phase === "setup") {
      if (password.length < 6) {
        setError("Password must be at least 6 characters.");
        return;
      }
      if (password !== confirm) {
        setError("Passwords do not match.");
        return;
      }
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/magic", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.user || !data?.redirect) {
        setError(data?.error || "Something went wrong. Please try again.");
        setSubmitting(false);
        return;
      }
      localStorage.setItem("crafd-user", JSON.stringify(data.user));
      window.location.replace(data.redirect);
    } catch {
      setError("Something went wrong. Please try again.");
      setSubmitting(false);
    }
  }

  const fieldClass =
    "border-white/10 bg-white/10 text-white placeholder:text-neutral-500 focus-visible:ring-crafd-yellow";

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden">
      <Image src="/images/login.webp" alt="" fill priority className="object-cover blur-sm scale-105 brightness-[0.35]" />

      <div className="relative z-10 w-full max-w-sm rounded-xl bg-black/40 px-8 py-10 backdrop-blur-md border border-white/10">
        <Image src="/images/crafd-logo-full-white.svg" alt="CRAF'd" width={150} height={99} priority className="mb-8" />

        {phase === "loading" && (
          <div className="flex items-center gap-2 text-neutral-300 text-sm">
            <Loader2 className="size-4 animate-spin" /> Opening your report…
          </div>
        )}

        {phase === "dead" && (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-red-400">{error}</p>
            <button
              onClick={() => router.replace("/login")}
              className="text-sm text-crafd-yellow underline underline-offset-4 hover:text-crafd-yellow/80 text-left"
            >
              Go to sign in
            </button>
          </div>
        )}

        {(phase === "setup" || phase === "verify") && (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <h1 className="text-lg font-semibold text-white">
                {phase === "setup" ? "Set your password" : "Enter your password"}
              </h1>
              <p className="text-neutral-400 text-sm mt-1">
                {phase === "setup"
                  ? `Choose a password for ${name || "your organization"}. You'll use it each time you open this report.`
                  : `Enter the password for ${name || "your organization"} to open this report.`}
              </p>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="password" className="text-neutral-300 text-sm">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={phase === "setup" ? "Choose a password" : "Enter your password"}
                className={fieldClass}
                autoFocus
              />
            </div>

            {phase === "setup" && (
              <div className="flex flex-col gap-2">
                <Label htmlFor="confirm" className="text-neutral-300 text-sm">Confirm password</Label>
                <Input
                  id="confirm"
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="Re-enter your password"
                  className={fieldClass}
                />
              </div>
            )}

            {error && <p className="text-sm text-red-400">{error}</p>}

            <Button
              type="submit"
              disabled={submitting}
              className="mt-2 bg-crafd-yellow text-black font-semibold hover:bg-crafd-yellow/90"
            >
              {submitting ? <Loader2 className="size-4 animate-spin" /> : phase === "setup" ? "Set password & continue" : "Continue"}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
