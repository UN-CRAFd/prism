"use client";

export const dynamic = "force-dynamic";

import { useState } from "react";
import { KeyRound, Loader2, CheckCircle2, AlertCircle, Tag, List } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LabelsEditor } from "@/components/admin/labels-editor";
import { OptionsEditor } from "@/components/admin/options-editor";

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

      <div className="flex-1 px-8 py-8 space-y-8">
        {/* Change admin password — single compact row */}
        <form onSubmit={handleSubmit} className="rounded-xl border bg-card p-4 flex flex-wrap items-end gap-3">
          <div className="flex items-center gap-2 mr-1 shrink-0">
            <KeyRound className="size-5 text-amber-500 shrink-0" />
            <h2 className="text-sm font-semibold whitespace-nowrap">Change admin password</h2>
          </div>
          <div className="space-y-1 min-w-[160px] flex-1">
            <Label htmlFor="current-password" className="text-xs">Current</Label>
            <Input
              id="current-password"
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
            />
          </div>
          <div className="space-y-1 min-w-[160px] flex-1">
            <Label htmlFor="new-password" className="text-xs">New (min {MIN_LENGTH})</Label>
            <Input
              id="new-password"
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
          </div>
          <div className="space-y-1 min-w-[160px] flex-1">
            <Label htmlFor="confirm-password" className="text-xs">Confirm</Label>
            <Input
              id="confirm-password"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
          </div>
          <Button type="submit" disabled={!canSubmit} className="shrink-0">
            {saving && <Loader2 className="size-4 mr-2 animate-spin" />}
            Change
          </Button>
          {error && (
            <span className="flex items-center gap-1.5 text-sm text-red-700 basis-full">
              <AlertCircle className="size-4 shrink-0" />{error}
            </span>
          )}
          {success && (
            <span className="flex items-center gap-1.5 text-sm text-green-700 basis-full">
              <CheckCircle2 className="size-4 shrink-0" />Password changed successfully.
            </span>
          )}
          {!error && confirmPassword.length > 0 && confirmPassword !== newPassword && (
            <span className="text-sm text-red-600 basis-full">Passwords do not match.</span>
          )}
        </form>

        {/* Interface labels (left) + Dropdown options (right) */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-8 items-start">
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

          <div className="rounded-xl border bg-card p-6">
            <div className="flex items-center gap-3 mb-1">
              <List className="size-5 text-amber-500 shrink-0" />
              <h2 className="text-base font-semibold">Dropdown options</h2>
            </div>
            <p className="text-sm text-muted-foreground mb-6">
              Add, edit, reorder, or remove the choices in the platform&apos;s dropdowns
              (statuses, categories, types, and more). Changes apply everywhere on the next
              page load. Renaming an option does not change values already saved on existing
              records. Use <span className="font-medium">Reset to default</span> on a dropdown
              or <span className="font-medium">Reset all</span> to restore the originals.
            </p>
            <OptionsEditor />
          </div>
        </div>
      </div>
    </div>
  );
}
