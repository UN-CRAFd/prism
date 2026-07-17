"use client";

import { useState } from "react";
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
  const { login } = useAuth();
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const success = await login(username, password);
    if (success) {
      const stored = localStorage.getItem("crafd-user");
      const user = stored ? JSON.parse(stored) : null;
      if (user?.role === "admin") {
        router.push("/admin");
      } else {
        router.push("/partner");
      }
    } else {
      setError("Invalid username or password");
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
      <div className="relative z-10 flex w-full max-w-md flex-col justify-center px-10 py-12 min-h-screen bg-black/40 backdrop-blur-md border-r border-white/10">
        <div className="mb-10">
          <Image
            src="/images/crafd-logo-full-white.svg"
            alt="CRAF'd"
            width={200}
            height={132}
            priority
          />
        </div>

       <h1 className="text-2xl text-white mb-0">
  <span className="font-bold font-qanelas">PRISM</span>{" "}
  <span className="font-normal font-roboto">Administration Platform</span>
</h1>
        <p className="text-white text-sm mb-12">
          <span className="font-bold">P</span>roject{" "}
          <span className="font-bold">R</span>eporting,{" "}
          <span className="font-bold">I</span>nformation{" "}
          <span className="font-bold">S</span>haring{" "}
          &{" "}
          <span className="font-bold">M</span>anagement
        </p>

        <p className="text-neutral-400 text-sm mb-8">
          Sign in with your credentials to continue. If you don&apos;t have an account, please contact the CRAF'd Secretariat.
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="username" className="text-neutral-300 text-sm">
              Username
            </Label>
            <Input
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter your username"
              className="border-white/10 bg-white/10 text-white placeholder:text-neutral-500 focus-visible:ring-crafd-yellow"
              autoFocus
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="password" className="text-neutral-300 text-sm">
              Password
            </Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              className="border-white/10 bg-white/10 text-white placeholder:text-neutral-500 focus-visible:ring-crafd-yellow"
            />
          </div>
          {error && (
            <p className="text-sm text-red-400">{error}</p>
          )}
          <Button
            type="submit"
            className="mt-2 bg-crafd-yellow text-black font-semibold hover:bg-crafd-yellow/90"
          >
            Sign In
          </Button>
        </form>
      </div>
    </div>
  );
}
