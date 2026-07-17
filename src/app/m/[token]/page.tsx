"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Image from "next/image";
import { Loader2 } from "lucide-react";

// Magic-link landing. Exchanges the token for a partner session, writes it to
// localStorage, then hard-navigates so the root AuthProvider re-initialises from
// storage (a soft router.push would leave the in-memory user null and the guard
// would bounce to /login).
export default function MagicLinkPage() {
  const params = useParams<{ token: string }>();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = Array.isArray(params.token) ? params.token[0] : params.token;
    if (!token) {
      setError("This link is invalid.");
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/auth/magic?token=${encodeURIComponent(token)}`);
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok || !data?.user || !data?.redirect) {
          setError(data?.error || "This link is invalid or has expired.");
          return;
        }
        localStorage.setItem("crafd-user", JSON.stringify(data.user));
        window.location.replace(data.redirect);
      } catch {
        if (!cancelled) setError("Something went wrong opening this link.");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [params.token]);

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden">
      <Image
        src="/images/login.webp"
        alt=""
        fill
        priority
        className="object-cover blur-sm scale-105 brightness-[0.35]"
      />
      <div className="relative z-10 flex flex-col items-center gap-6 rounded-xl bg-black/40 px-10 py-12 backdrop-blur-md border border-white/10">
        <Image src="/images/crafd-logo-full-white.svg" alt="CRAF'd" width={160} height={106} priority />
        {error ? (
          <div className="flex flex-col items-center gap-3 text-center">
            <p className="text-sm text-red-400 max-w-xs">{error}</p>
            <button
              onClick={() => router.replace("/login")}
              className="text-sm text-crafd-yellow underline underline-offset-4 hover:text-crafd-yellow/80"
            >
              Go to sign in
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-neutral-300 text-sm">
            <Loader2 className="size-4 animate-spin" /> Signing you in…
          </div>
        )}
      </div>
    </div>
  );
}
