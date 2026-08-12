"use client";

export const dynamic = "force-dynamic";

import { useState } from "react";
import { KeyRound, Loader2, CheckCircle2, AlertCircle, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LabelsEditor } from "@/components/admin/labels-editor";

const MIN_LENGTH = 8;

export default function AdminSettingsPage() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const canSubmit =
    !!currentPassword &&
    newPassword.length >= MIN_LENGTH &&
    newPassword === confirmPassword &&
    !saving;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    if (newPassword !== confirmPassword) {
      setError("New password and confirmation do not match.");
      return;
    }
    if (newPassword.length < MIN_LENGTH) {
      setError(`New password must be at least ${MIN_LENGTH} characters.`);
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/admin/settings/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error ?? "Failed to change password.");
        return;
      }
      setSuccess(true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col min-h-full bg-background">
      <div className="bg-neutral-950 text-white px-8 h-32 flex flex-col justify-center">
        <p className="text-neutral-400 text-sm mb-1">Administration</p>
        <h1 className="text-3xl font-bold font-qanelas">Settings</h1>
        <p className="text-neutral-400 text-sm mt-2">
          Manage the CRAF&apos;d Secretariat admin account
        </p>
      </div>

      <div className="flex-1 px-8 py-8">
        <div className="max-w-xl">
          <div className="rounded-xl border bg-card p-6">
            <div className="flex items-center gap-3 mb-1">
              <KeyRound className="size-5 text-amber-500 shrink-0" />
              <h2 className="text-base font-semibold">Change admin password</h2>
            </div>
            <p className="text-sm text-muted-foreground mb-6">
              Updates the password for the shared <span className="font-medium">admin</span> login.
              You will stay signed in on this device; only future logins use the new password.
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="current-password">Current password</Label>
                <Input
                  id="current-password"
                  type="password"
                  autoComplete="current-password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="new-password">New password</Label>
                <Input
                  id="new-password"
                  type="password"
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  At least {MIN_LENGTH} characters.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="confirm-password">Confirm new password</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
                {confirmPassword.length > 0 && confirmPassword !== newPassword && (
                  <p className="text-xs text-red-600">Passwords do not match.</p>
                )}
              </div>

              {error && (
                <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  <AlertCircle className="size-4 mt-0.5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}
              {success && (
                <div className="flex items-start gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
                  <CheckCircle2 className="size-4 mt-0.5 shrink-0" />
                  <span>Password changed successfully.</span>
                </div>
              )}

              <div className="pt-2">
                <Button type="submit" disabled={!canSubmit}>
                  {saving && <Loader2 className="size-4 mr-2 animate-spin" />}
                  Change password
                </Button>
              </div>
            </form>
          </div>
        </div>

        <div className="max-w-4xl mt-8">
          <div className="rounded-xl border bg-card p-6">
            <div className="flex items-center gap-3 mb-1">
              <Tag className="size-5 text-amber-500 shrink-0" />
              <h2 className="text-base font-semibold">Interface labels</h2>
            </div>
            <p className="text-sm text-muted-foreground mb-6">
              Override any user-facing text across the platform (field names, headings,
              instructions, placeholders). Edited values apply everywhere on the next page
              load; leave a field untouched to keep the default. Use{" "}
              <span className="font-medium">Reset</span> to restore a single default or{" "}
              <span className="font-medium">Reset all</span> to clear every override.
            </p>
            <LabelsEditor />
          </div>
        </div>
      </div>
    </div>
  );
}
