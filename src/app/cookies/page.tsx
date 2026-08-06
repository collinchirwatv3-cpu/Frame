import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, DraftNotice } from "@/components/legal/LegalPage";

export const metadata: Metadata = { title: "Cookie Policy — FRAMES" };

export default function CookiesPage() {
  return (
    <LegalPage title="Cookie Policy" updated="August 4, 2026">
      <DraftNotice />

      <p>
        FRAMES uses a small number of cookies and local browser storage — all functional, none
        for third-party advertising or tracking. Here&apos;s exactly what&apos;s stored and why.
      </p>

      <h2>Essential — session</h2>
      <p>
        Signing in sets an <strong>httpOnly session cookie</strong> (via Supabase) that keeps you
        logged in. It&apos;s required for the app to work and can&apos;t be disabled while
        staying signed in — signing out clears it.
      </p>

      <h2>Functional — local storage</h2>
      <p>
        These live in your browser&apos;s local storage, not as cookies, and never leave your
        device — they&apos;re not sent to our servers:
      </p>
      <ul>
        <li>Whether you&apos;ve completed onboarding.</li>
        <li>Your muted/sound preference.</li>
        <li>An in-progress upload draft (title/description/category), so a refresh doesn&apos;t lose it.</li>
        <li>A validated invite code, during the closed alpha.</li>
      </ul>

      <h2>What we don&apos;t use</h2>
      <p>
        No third-party advertising cookies, no cross-site tracking pixels, no data brokers. If
        that changes, we&apos;ll update this page before it happens, not after.
      </p>

      <h2>Error monitoring</h2>
      <p>
        We use Sentry to catch bugs in production. It can set a small cookie tied to your current
        session to correlate error reports; it does not track you across other sites. Session
        replay is off by default.
      </p>

      <h2>Questions</h2>
      <p>
        See <Link href="/contact">Contact</Link>, or the full <Link href="/privacy">Privacy Policy</Link>.
      </p>
    </LegalPage>
  );
}
