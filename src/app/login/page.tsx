"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const { login } = useAuth();
  const router = useRouter();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const success = login(username, password);
    if (success) {
      const stored = localStorage.getItem("crafd-user");
      const user = stored ? JSON.parse(stored) : null;
      if (user?.role === "admin") {
        router.push("/admin");
      } else {
        router.push("/partner/survey");
      }
    } else {
      setError("Invalid username or password");
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950 p-4">
      <div className="mb-10">
        <Image
          src="/images/crafd-logo-full-white.svg"
          alt="CRAF'd"
          width={280}
          height={185}
          priority
        />
      </div>

      <Card className="w-full max-w-md border-neutral-800 bg-neutral-900/80 backdrop-blur-sm">
        <CardHeader className="text-center">
          <CardTitle className="text-xl text-white">
            Reporting Platform
          </CardTitle>
          <CardDescription className="text-neutral-400">
            Sign in to access your dashboard
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="username" className="text-neutral-300">
                Username
              </Label>
              <Input
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter your username"
                className="border-neutral-700 bg-neutral-800 text-white placeholder:text-neutral-500"
                autoFocus
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="password" className="text-neutral-300">
                Password
              </Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                className="border-neutral-700 bg-neutral-800 text-white placeholder:text-neutral-500"
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

          <div className="mt-6 border-t border-neutral-800 pt-4">
            <p className="text-xs text-neutral-500 text-center">
              Admin: admin / admin
            </p>
            <p className="text-xs text-neutral-500 text-center mt-1">
              Partners: acled, iom, fhn (password: [name]2024)
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
