import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { Logo } from "@/components/ui/Logo";

/** Shared reading layout for every legal/informational page (Terms, Privacy,
 * Community Guidelines, Cookies, Contact) — lives outside the (app) shell
 * (no bottom nav, no onboarding gate) since these need to be readable by
 * someone who isn't a member yet, matching how /watch and /s/[token] are
 * already deliberately exempt from the invite gate. */
export function LegalPage({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-dvh">
      <header className="border-b border-border px-6 py-5 flex items-center justify-between max-w-2xl mx-auto">
        <Link href="/" className="flex items-center gap-2">
          <Logo size={24} />
          <span className="text-base font-bold tracking-tight">FRAMES</span>
        </Link>
        <Link
          href="/"
          className="flex items-center gap-1 text-xs text-text-secondary hover:text-accent transition-colors"
        >
          <ChevronLeft size={14} />
          Back
        </Link>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-10 pb-24">
        <h1 className="text-2xl font-bold mb-1.5">{title}</h1>
        <p className="text-xs text-text-secondary mb-8">Last updated {updated}</p>

        <div
          className="flex flex-col gap-4 text-sm leading-relaxed text-accent/90
            [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-accent [&_h2]:mt-4
            [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:text-accent [&_h3]:mt-2
            [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:flex [&_ul]:flex-col [&_ul]:gap-1.5
            [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2
            [&_strong]:text-accent [&_strong]:font-semibold"
        >
          {children}
        </div>
      </main>
    </div>
  );
}

/** Shown at the top of every legal page — these are real, complete starting
 * drafts covering the substantive points each policy needs, not filler, but
 * they were drafted by an engineering pass, not reviewed by a lawyer. That
 * review is a real step before treating any of this as actually binding. */
export function DraftNotice() {
  return (
    <div className="rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 text-xs text-text-secondary mb-2">
      <strong className="text-primary">Draft — pending legal review.</strong> This page is a
      complete starting draft, not a substitute for review by a lawyer before FRAMES is used by
      real creators outside the team.
    </div>
  );
}
