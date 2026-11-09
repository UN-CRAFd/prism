"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  // "Forgot password": idle → sending → sent (message shown) / error.
  const [resetState, setResetState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [resetMessage, setResetMessage] = useState("");
  const { login } = useAuth();
  const router = useRouter();
  // Arrived here because the account's password was changed elsewhere
  // (lib/auth-context redirects with ?signedOut=password).
  const [signedOutNote, setSignedOutNote] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- read once from the URL after mount
    setSignedOutNote(new URLSearchParams(window.location.search).get("signedOut") === "password");
  }, []);

  // E-mails CRAF'd (the address set on the admin Settings page) for this username.
  async function handleForgot() {
    if (!username.trim()) {
      setResetState("error");
      setResetMessage("Please enter your username first, then click \"Forgot password\".");
      return;
    }
    setResetState("sending");
    setResetMessage("");
    try {
      const res = await fetch("/api/auth/forgot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setResetState("sent");
        setResetMessage(data?.message ?? "CRAF'd has been contacted and will be in touch. This might take a moment.");
      } else {
        setResetState("error");
        setResetMessage(data?.error ?? "We could not contact CRAF'd automatically. Please email crafd@un.org.");
      }
    } catch {
      setResetState("error");
      setResetMessage("Network error. Please try again.");
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const result = await login(username, password);
    if (result.ok) {
      const stored = localStorage.getItem("crafd-user");
      const user = stored ? JSON.parse(stored) : null;
      if (user?.role === "admin") {
        router.push("/admin");
      } else {
        router.push("/partner");
      }
    } else {
      // The server says how many attempts are left, or that the account is locked.
      setError(result.error ?? "Invalid username or password");
    }
  }

  return (
    <div className="relative flex min-h-screen overflow-hidden">
      {/* Fullscreen background */}
      <Image
        src="/images/login.webp"
        alt=""
        fill
        priority
        className="object-cover blur-sm scale-105 brightness-[0.35]"
      />

      {/* Left panel — logo + form */}
      <div className="relative z-10 flex w-full max-w-md flex-col px-10 py-12 min-h-screen bg-black/40 backdrop-blur-md border-r border-white/10">
        <Image
          src="/images/crafd-logo-full-white.svg"
          alt="CRAF'd"
          width={72}
          height={48}
          priority
          className="shrink-0"
        />

        <div className="flex flex-1 flex-col justify-center">
          <h1 className="text-2xl text-crafd-yellow mb-0">
            <span className="font-bold">PRISM</span>{" "}
            <span className="font-normal font-roboto text-xl">Administration Platform</span>
          </h1>
          <p className="text-white text-sm mb-0">
            <span className="font-bold">P</span>roject{" "}
            <span className="font-bold">R</span>eporting,{" "}
            <span className="font-bold">I</span>nformation{" "}
            <span className="font-bold">S</span>haring{" "}
            &{" "}
            <span className="font-bold">M</span>anagement
          </p>

          <p className="text-sm text-neutral-400 mt-16 mb-8">
            <span className="font-semibold text-white">Sign in with your credentials to continue.</span>{" "}
            If you don&apos;t have an account, please contact the CRAF&apos;d Secretariat.
          </p>

          {signedOutNote && (
            <p className="text-sm text-crafd-yellow mb-6" role="status">
              You have been signed out because the password for this account was changed. Please sign in with the new password.
            </p>
          )}

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="username" className="text-white text-sm">
                Username
              </Label>
              <Input
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter your username"
                className="border-transparent bg-white text-neutral-900 placeholder:text-neutral-400 focus-visible:ring-crafd-yellow"
                autoFocus
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="password" className="text-white text-sm">
                Password
              </Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                className="border-transparent bg-white text-neutral-900 placeholder:text-neutral-400 focus-visible:ring-crafd-yellow"
              />
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleForgot}
                  disabled={resetState === "sending" || resetState === "sent"}
                  className="text-xs text-neutral-300 hover:underline disabled:opacity-60 disabled:no-underline"
                >
                  {resetState === "sending" ? "Contacting CRAF'd…" : "Forgot password"}
                </button>
              </div>
              {resetMessage && (
                <p className={resetState === "error" ? "text-sm text-red-400" : "text-sm text-neutral-200"} role="status">
                  {resetMessage}
                </p>
              )}
            </div>
            {error && (
              <p className="text-sm text-red-400">{error}</p>
            )}
            <Button
              type="submit"
              className="mt-2 bg-crafd-yellow text-black font-semibold hover:bg-crafd-yellow/90"
            >
              Sign in
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
