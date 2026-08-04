import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, DraftNotice } from "@/components/legal/LegalPage";

export const metadata: Metadata = { title: "Community Guidelines — FRAME" };

export default function CommunityGuidelinesPage() {
  return (
    <LegalPage title="Community Guidelines" updated="August 4, 2026">
      <DraftNotice />

      <p>
        FRAME exists for landscape storytelling — a cinematic home for filmmakers, drone pilots,
        and anyone who shoots wide. These guidelines keep it that way.
      </p>

      <h2>What belongs on FRAME</h2>
      <ul>
        <li>Original landscape video (16:9, 21:9 Cinema, or 16:10) that you have the rights to.</li>
        <li>Real shooting details, credit, and context — Creator Notes and Shot Details exist for this.</li>
        <li>Respectful discussion in comments.</li>
      </ul>

      <h2>Zero tolerance</h2>
      <p>
        <strong>
          Content that sexually exploits or endangers minors is never permitted, under any
          circumstance.
        </strong>{" "}
        We remove it immediately and report it to the National Center for Missing &amp;
        Exploited Children (NCMEC) and law enforcement as required by law. Accounts responsible
        are permanently banned.
      </p>

      <h2>Not permitted</h2>
      <ul>
        <li>Content that infringes someone else&apos;s copyright.</li>
        <li>Harassment, hate speech, or targeted abuse of another creator or viewer.</li>
        <li>Spam, scams, or coordinated inauthentic behavior.</li>
        <li>Illegal content of any kind.</li>
        <li>Impersonating another person or creator.</li>
        <li>Content that isn&apos;t genuinely landscape/cinematic video — FRAME is not a general video platform.</li>
      </ul>

      <h2>Reporting</h2>
      <p>
        Every video has a <strong>Report</strong> option (tap the ⋯ menu on any video). Reports
        go to a real review queue — a person looks at every one. For copyright specifically, see
        the DMCA process in our <Link href="/terms">Terms of Service</Link>.
      </p>

      <h2>Enforcement</h2>
      <p>
        Depending on severity, we may remove content, restrict an account&apos;s reach, suspend
        an account temporarily, or ban it permanently. Zero-tolerance violations result in an
        immediate, permanent ban with no warning.
      </p>

      <h2>Appeals</h2>
      <p>
        If you believe a moderation action was made in error, contact us via the{" "}
        <Link href="/contact">Contact</Link> page and we&apos;ll review it.
      </p>
    </LegalPage>
  );
}
