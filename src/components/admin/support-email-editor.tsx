"use client";

import { useEffect, useState } from "react";
import { Loader2, CheckCircle2, AlertCircle, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Settings card: the CRAF'd address that "Forgot password" requests from the
// login page are e-mailed to (stored server-side in app_settings).
export function SupportEmailEditor() {
  const [email, setEmail] = useState("");
  const [saved, setSaved] = useState<string | null>(null);
  const [mailConfigured, setMailConfigured] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; text: string } | null>(null);

  async function sendTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/admin/settings/support-email/test", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      setTestResult(res.ok
        ? { ok: true, text: `Test e-mail sent to ${data.to}. Check that inbox (and its spam folder).` }
        : { ok: false, text: data?.error ?? "Sending failed." });
    } catch {
      setTestResult({ ok: false, text: "Network error. Please try again." });
    } finally {
      setTesting(false);
    }
  }

  useEffect(() => {
    fetch("/api/admin/settings/support-email")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: { email: string | null; mailConfigured: boolean }) => {
        setEmail(d.email ?? "");
        setSaved(d.email ?? "");
        setMailConfigured(d.mailConfigured);
      })
      .catch(() => setError("Could not load the current address."))
      .finally(() => setLoading(false));
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      const res = await fetch("/api/admin/settings/support-email", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error ?? "Failed to save the address.");
        return;
      }
      setSaved(data.email ?? "");
      setSuccess(true);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} className="rounded-xl border bg-card p-6">
      <div className="flex items-center gap-3 mb-1">
        <Mail className="size-5 text-crafd-yellow-900 shrink-0" />
        <h2 className="t-heading-section">Password help requests</h2>
      </div>
      <p className="text-sm text-muted-foreground mb-4">
        When a partner clicks <span className="font-medium">Forgot password</span> on the login page, an e-mail
        is sent to this address so the Secretariat can help (for example by sending a new share link).
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1 min-w-[260px] flex-1 max-w-md">
          <Label htmlFor="support-email" className="text-xs">Send requests to</Label>
          <Input
            id="support-email"
            type="email"
            value={email}
            disabled={loading}
            placeholder="e.g. crafd@un.org"
            onChange={(e) => { setEmail(e.target.value); setSuccess(false); }}
          />
        </div>
        <Button type="submit" disabled={loading || saving || email.trim() === (saved ?? "")} className="shrink-0">
          {saving && <Loader2 className="size-4 mr-2 animate-spin" />}
          Save
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={sendTest}
          disabled={loading || testing || !saved || mailConfigured === false}
          className="shrink-0"
          title={!saved ? "Save an address first" : undefined}
        >
          {testing && <Loader2 className="size-4 mr-2 animate-spin" />}
          Send test e-mail
        </Button>
        {testResult && (
          <span className={`flex items-center gap-1.5 text-sm basis-full ${testResult.ok ? "text-green-700" : "text-red-700"}`}>
            {testResult.ok ? <CheckCircle2 className="size-4 shrink-0" /> : <AlertCircle className="size-4 shrink-0" />}
            {testResult.text}
          </span>
        )}
        {error && (
          <span className="flex items-center gap-1.5 text-sm text-red-700 basis-full">
            <AlertCircle className="size-4 shrink-0" />{error}
          </span>
        )}
        {success && (
          <span className="flex items-center gap-1.5 text-sm text-green-700 basis-full">
            <CheckCircle2 className="size-4 shrink-0" />Saved.
          </span>
        )}
        {!loading && !saved && !error && (
          <span className="text-sm text-red-700 basis-full">
            No address set yet: partners who click &quot;Forgot password&quot; are asked to e-mail crafd@un.org instead.
          </span>
        )}
        {mailConfigured === false && (
          <span className="text-sm text-red-700 basis-full">
            E-mail sending is not configured on the server yet (SMTP settings), so requests cannot be sent.
          </span>
        )}
      </div>
    </form>
  );
}
