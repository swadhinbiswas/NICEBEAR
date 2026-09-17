import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { authClient } from "../lib/auth/client";
import { buttonClass, cardClass, cn, inputClass } from "../components/ui";
import { Err } from "./shared";

const EmailSchema = z.object({
  // Optional text inputs submit "" when untouched — accept it (submit maps "" → fallback).
  name: z.string().trim().max(128).optional(),
  email: z.string().email(),
  password: z.string().min(8).max(128),
});

/** Email sign-up/sign-in + GitHub OAuth entry point (/login). */
export function Login({ githubOn, next }: { githubOn: boolean; next: string }) {
  const [mode, setMode] = useState<"in" | "up">("in");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Mounted only runs client-side post-hydration: gating the submit on it
  // means pre-hydration clicks are impossible instead of silently dropped.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  const form = useForm<z.infer<typeof EmailSchema>>({
    resolver: zodResolver(EmailSchema),
    defaultValues: { name: "", email: "", password: "" },
  });

  async function submit(v: z.infer<typeof EmailSchema>) {
    setError(null);
    setBusy(true);
    try {
      const res =
        mode === "up"
          ? await authClient.signUp.email({ name: v.name || v.email.split("@")[0]!, email: v.email, password: v.password })
          : await authClient.signIn.email({ email: v.email, password: v.password });
      if (res.error) throw new Error(res.error.message ?? "authentication failed");
      window.location.href = next;
    } catch (e) {
      setError(e instanceof Error ? e.message : "authentication failed");
    } finally {
      setBusy(false);
    }
  }

  async function github() {
    setError(null);
    try {
      await authClient.signIn.social({ provider: "github", callbackURL: next });
    } catch (e) {
      setError(e instanceof Error ? e.message : "GitHub sign-in failed");
    }
  }

  return (
    <div className={cn(cardClass(), "max-w-md mx-auto mt-16")}>
      <h1 className="text-lg font-semibold">Sign in to NiceBear</h1>
      <div className="mt-4 space-y-2">
        {githubOn && (
          <button className={cn(buttonClass("ghost"), "w-full")} onClick={github}>
            Continue with GitHub
          </button>
        )}
        <div className="flex gap-2 text-sm">
          <button className={mode === "in" ? "font-semibold underline" : "text-zinc-400"} onClick={() => setMode("in")}>
            Sign in
          </button>
          <button className={mode === "up" ? "font-semibold underline" : "text-zinc-400"} onClick={() => setMode("up")}>
            Sign up
          </button>
        </div>
        <form className="space-y-2" onSubmit={form.handleSubmit(submit)}>
          {mode === "up" && (
            <input className={inputClass()} placeholder="Name" {...form.register("name")} autoComplete="name" />
          )}
          <input className={inputClass()} placeholder="Email" {...form.register("email")} autoComplete="email" />
          <input
            className={inputClass()}
            type="password"
            placeholder="Password (8+ chars)"
            {...form.register("password")}
            autoComplete={mode === "up" ? "new-password" : "current-password"}
          />
          <button className={cn(buttonClass(), "w-full")} disabled={busy || !mounted}>
            {busy ? "…" : mode === "up" ? "Create account" : "Sign in"}
          </button>
        </form>
        {(form.formState.errors.email || form.formState.errors.password || form.formState.errors.name) && (
          <p className="text-xs text-red-300">Check the form: valid email, password 8+ chars.</p>
        )}
        {error && <Err error={new Error(error)} />}
        <p className="text-xs text-zinc-500">
          Prefer API keys? <a className="underline" href="/dashboard/api-keys">Connect with nb_live_…</a>
        </p>
      </div>
    </div>
  );
}
