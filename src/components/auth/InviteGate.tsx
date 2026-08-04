"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Logo } from "@/components/ui/Logo";
import { useEngagementStore } from "@/store/engagement-store";
import { useCurrentUserStore } from "@/store/current-user-store";
import { useInviteStore } from "@/store/invite-store";

// Public share links are the one deliberate exception to "nothing is
// reachable without a code" — they're designed to work for people who
// aren't on FRAME at all (see /s/[token], /watch/[id]'s Open Graph unfurl).
// Gating those would silently break an already-shipped feature.
const BYPASS_PREFIXES = ["/s/", "/watch"];

export function InviteGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const engagementHydrated = useEngagementStore((s) => s.hydrated);
  const userId = useEngagementStore((s) => s.userId);
  const inviteRedeemedAt = useCurrentUserStore((s) => s.inviteRedeemedAt);
  const inviteHasHydrated = useInviteStore((s) => s.hasHydrated);
  const validatedCode = useInviteStore((s) => s.validatedCode);
  const setValidatedCode = useInviteStore((s) => s.setValidatedCode);

  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  if (BYPASS_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return <>{children}</>;
  }

  // Wait for both auth and the locally-stored code to resolve before
  // deciding anything — otherwise a real member briefly flashes the gate on
  // every load.
  if (!engagementHydrated || !inviteHasHydrated) return null;

  const isMember = !!userId && !!inviteRedeemedAt;
  const hasStoredCode = !!validatedCode;
  if (isMember || hasStoredCode) return <>{children}</>;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = code.trim();
    if (!trimmed) return;
    setSubmitting(true);
    setError("");

    try {
      // Already signed in (landed here with no redeemed invite and no
      // stored code — e.g. an old session) — redeem directly.
      const endpoint = userId ? "/api/invite/redeem" : "/api/invite/validate";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: trimmed }),
      });
      const body = await res.json().catch(() => ({}));

      if (userId) {
        if (!res.ok) throw new Error(body.error || "That code isn't valid");
        window.location.reload();
        return;
      }

      if (!res.ok || body.valid === false) {
        throw new Error(body.error || "That code isn't valid");
      }
      setValidatedCode(trimmed.toUpperCase());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm text-center">
        <div className="flex items-center gap-2 justify-center mb-8">
          <Logo size={32} />
          <span className="text-2xl font-bold tracking-tight">FRAME</span>
        </div>
        <h1 className="text-lg font-semibold mb-1.5">You need an invite</h1>
        <p className="text-sm text-text-secondary mb-6">
          FRAME is in a closed creator alpha right now — enter your invite code to get in.
        </p>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <input
            autoFocus
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Invite code"
            className="bg-card border border-border rounded-full px-4 py-3 text-sm text-center tracking-widest uppercase outline-none focus:border-primary transition-colors"
          />
          <button
            type="submit"
            disabled={submitting || !code.trim()}
            className="py-3 rounded-full bg-primary text-bg text-sm font-semibold disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {submitting && <Loader2 size={16} className="animate-spin" />}
            Continue
          </button>
        </form>
        {error && <p className="text-xs text-primary mt-4">{error}</p>}
      </div>
    </div>
  );
}
