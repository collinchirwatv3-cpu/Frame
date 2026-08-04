import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, DraftNotice } from "@/components/legal/LegalPage";

export const metadata: Metadata = { title: "Privacy Policy — FRAME" };

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" updated="August 4, 2026">
      <DraftNotice />

      <p>
        This policy explains what information FRAME collects, how it&apos;s used, and the
        choices you have about it.
      </p>

      <h2>Information we collect</h2>
      <p>
        <strong>Account information.</strong> When you sign in with Google, Apple, or email, we
        receive your email address and, if your provider shares it, your name and profile photo.
        If you sign up with email, we send a one-time sign-in link rather than storing a
        password — FRAME never has access to your Google or Apple password.
      </p>
      <p>
        <strong>Profile information.</strong> Anything you choose to add to your profile —
        username, bio, avatar, banner, equipment list, website — is stored and shown publicly on
        FRAME.
      </p>
      <p>
        <strong>Content you upload.</strong> Videos, titles, descriptions, and any shooting
        details you attach to them are stored and, unless you mark a video private, shown
        publicly.
      </p>
      <p>
        <strong>Usage information.</strong> Likes, follows, saves, comments, and watch activity
        are stored against your account to power your feed and profile.
      </p>

      <h2>How we use it</h2>
      <ul>
        <li>To operate your account and show your content to other creators and viewers.</li>
        <li>To personalize what you see (interests you pick, creators you follow).</li>
        <li>To keep FRAME secure — detecting abuse, enforcing rate limits, investigating reports.</li>
        <li>To contact you about your account when necessary (security, policy changes).</li>
      </ul>
      <p>We do not sell your personal information.</p>

      <h2>Who we share it with</h2>
      <p>FRAME is built on a small number of infrastructure providers who process data on our behalf:</p>
      <ul>
        <li>
          <strong>Supabase</strong> — authentication and our database (accounts, profiles, videos
          metadata, engagement).
        </li>
        <li>
          <strong>Cloudflare</strong> — video storage and delivery (Stream), and asset storage
          (R2).
        </li>
        <li>
          <strong>Sentry</strong> — error monitoring, so we can find and fix bugs. Session replay
          is off by default.
        </li>
      </ul>
      <p>
        We don&apos;t share your data with advertisers — FRAME doesn&apos;t run third-party ad
        tracking. See our <Link href="/cookies">Cookie Policy</Link> for the specifics of what
        gets stored in your browser.
      </p>

      <h2>Your rights</h2>
      <p>
        You can edit your profile at any time from Settings. You can permanently delete your
        account — including your videos, comments, likes, and follows — from{" "}
        <strong>Settings → Danger zone → Delete account</strong>. This is immediate and
        can&apos;t be undone; we don&apos;t offer a recovery window for deleted accounts.
      </p>
      <p>
        If you&apos;d rather we handle a data request directly, reach us via the{" "}
        <Link href="/contact">Contact</Link> page.
      </p>

      <h2>Children&apos;s privacy</h2>
      <p>
        FRAME is not directed at children under 13, and we don&apos;t knowingly collect
        information from anyone under that age.
      </p>

      <h2>Changes to this policy</h2>
      <p>
        If we make a material change to this policy, we&apos;ll update the date at the top of
        this page.
      </p>

      <h2>Contact</h2>
      <p>
        Questions about this policy — see <Link href="/contact">Contact</Link>.
      </p>
    </LegalPage>
  );
}
