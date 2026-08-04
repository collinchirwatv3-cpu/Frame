"use client";

import { useState } from "react";
import { Loader2, Mail } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Logo } from "@/components/ui/Logo";

function GoogleGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 01-1.8 2.72v2.26h2.9c1.7-1.57 2.7-3.87 2.7-6.62z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.8.54-1.84.86-3.06.86-2.35 0-4.34-1.59-5.05-3.72H.95v2.33A9 9 0 009 18z"
      />
      <path fill="#FBBC05" d="M3.95 10.7A5.4 5.4 0 013.68 9c0-.59.1-1.17.27-1.7V4.97H.95A9 9 0 000 9c0 1.45.35 2.83.95 4.03l3-2.33z" />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.51.46 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 00.95 4.97l3 2.33C4.66 5.17 6.65 3.58 9 3.58z"
      />
    </svg>
  );
}

function AppleGlyph() {
  return (
    <svg width="16" height="18" viewBox="0 0 16 18" fill="currentColor">
      <path d="M13.05 9.5c.02 2.32 2.03 3.09 2.05 3.1-.02.06-.32 1.1-1.06 2.17-.64.93-1.31 1.85-2.36 1.87-1.03.02-1.36-.61-2.54-.61-1.17 0-1.54.59-2.52.63-1.01.04-1.78-1-2.43-1.93-1.32-1.9-2.33-5.38-.98-7.72.67-1.16 1.87-1.9 3.17-1.92 1-.02 1.94.67 2.55.67.6 0 1.75-.83 2.94-.71.5.02 1.9.2 2.8 1.52-.07.05-1.67.98-1.65 2.93zM10.98 2.1c.53-.64.89-1.53.79-2.42-.77.03-1.7.51-2.25 1.15-.5.56-.93 1.47-.81 2.33.85.07 1.73-.43 2.27-1.06z" />
    </svg>
  );
}

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(
    null
  );

  async function withOAuth(provider: "google" | "apple") {
    setLoading(provider);
    setMessage(null);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo: `${window.location.origin}/auth/callback` },
      });
      if (error) throw error;
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Something went wrong — try again.",
      });
    } finally {
      setLoading(null);
    }
  }

  async function withEmail(e: React.FormEvent) {
    e.preventDefault();
    setLoading("email");
    setMessage(null);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
      });
      if (error) throw error;
      setMessage({ type: "success", text: `Magic link sent to ${email}.` });
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Something went wrong — try again.",
      });
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2 justify-center mb-10">
          <Logo size={32} />
          <span className="text-2xl font-bold tracking-tight">FRAME</span>
        </div>

        <div className="flex flex-col gap-3">
          <button
            onClick={() => withOAuth("google")}
            disabled={loading !== null}
            className="flex items-center justify-center gap-3 py-3 rounded-full bg-card border border-border text-sm font-medium hover:bg-card/70 transition-colors disabled:opacity-60"
          >
            {loading === "google" ? <Loader2 size={16} className="animate-spin" /> : <GoogleGlyph />}
            Continue with Google
          </button>
          <button
            onClick={() => withOAuth("apple")}
            disabled={loading !== null}
            className="flex items-center justify-center gap-3 py-3 rounded-full bg-accent text-bg text-sm font-medium hover:bg-accent/90 transition-colors disabled:opacity-60"
          >
            {loading === "apple" ? <Loader2 size={16} className="animate-spin" /> : <AppleGlyph />}
            Continue with Apple
          </button>
        </div>

        <div className="flex items-center gap-3 my-6">
          <div className="h-px flex-1 bg-border" />
          <span className="text-xs text-text-secondary">or</span>
          <div className="h-px flex-1 bg-border" />
        </div>

        <form onSubmit={withEmail} className="flex flex-col gap-3">
          <div className="flex items-center gap-2 bg-card border border-border rounded-full px-4 py-3">
            <Mail size={16} className="text-text-secondary" />
            <input
              required
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="bg-transparent outline-none text-sm w-full placeholder:text-text-secondary"
            />
          </div>
          <button
            type="submit"
            disabled={loading !== null}
            className="py-3 rounded-full bg-primary text-bg text-sm font-semibold disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {loading === "email" && <Loader2 size={16} className="animate-spin" />}
            Continue with email
          </button>
        </form>

        {message && (
          <p
            className={`text-xs text-center mt-4 ${
              message.type === "error" ? "text-primary" : "text-text-secondary"
            }`}
          >
            {message.text}
          </p>
        )}
      </div>
    </div>
  );
}
