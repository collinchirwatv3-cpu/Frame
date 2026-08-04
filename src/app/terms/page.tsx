import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, DraftNotice } from "@/components/legal/LegalPage";

export const metadata: Metadata = { title: "Terms of Service — FRAME" };

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service" updated="August 4, 2026">
      <DraftNotice />

      <p>
        These terms govern your use of FRAME. By creating an account, you agree to them. FRAME
        is currently in a closed creator alpha — features, and these terms, may change as the
        product does.
      </p>

      <h2>Eligibility</h2>
      <p>
        You must be at least 13 years old to use FRAME. By creating an account you confirm you
        meet this requirement.
      </p>

      <h2>Your account</h2>
      <p>
        You&apos;re responsible for the activity on your account. Access during the alpha
        requires a valid invite code — codes are personal and shouldn&apos;t be shared beyond
        their intended use.
      </p>

      <h2>Your content</h2>
      <p>
        You own what you upload. By publishing a video on FRAME, you grant us a license to host,
        store, encode, and display it on the platform so other people can watch it — we
        don&apos;t claim ownership of your work. You&apos;re responsible for having the rights to
        anything you upload, including footage, music, and any people who appear in it.
      </p>
      <p>
        You can delete your own videos at any time, and delete your entire account (and
        everything in it) from Settings.
      </p>

      <h2>Acceptable use</h2>
      <p>
        Content and behavior on FRAME are governed by our{" "}
        <Link href="/community-guidelines">Community Guidelines</Link> — read them before
        uploading. We may remove content or suspend accounts that violate them.
      </p>

      <h2>Copyright &amp; DMCA</h2>
      <p>
        We respond to valid copyright infringement notices under the DMCA. If you believe your
        copyrighted work has been uploaded to FRAME without permission, contact us via the{" "}
        <Link href="/contact">Contact</Link> page with a description of the work, its location
        on FRAME, and your contact information.
      </p>

      <h2>Termination</h2>
      <p>
        You can delete your own account at any time. We may suspend or terminate accounts that
        violate these terms or the Community Guidelines, with notice where reasonably possible.
      </p>

      <h2>Disclaimers</h2>
      <p>
        FRAME is provided &ldquo;as is&rdquo; during this alpha period, without warranties of any
        kind. We&apos;re not liable for content posted by other users, or for service
        interruptions during active development.
      </p>

      <h2>Changes</h2>
      <p>We&apos;ll update the date at the top of this page when these terms change materially.</p>

      <h2>Contact</h2>
      <p>
        Questions about these terms — see <Link href="/contact">Contact</Link>.
      </p>
    </LegalPage>
  );
}
