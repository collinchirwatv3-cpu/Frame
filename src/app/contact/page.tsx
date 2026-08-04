import type { Metadata } from "next";
import { Mail } from "lucide-react";
import { LegalPage, DraftNotice } from "@/components/legal/LegalPage";

export const metadata: Metadata = { title: "Contact — FRAME" };

const CHANNELS = [
  {
    label: "General & support",
    email: "hello@getframe.app",
    description: "Questions, feedback, bug reports, or anything else.",
  },
  {
    label: "Trust & safety",
    email: "safety@getframe.app",
    description: "Report abuse, a moderation appeal, or a safety concern that needs urgent attention.",
  },
  {
    label: "Copyright / DMCA",
    email: "copyright@getframe.app",
    description: "Copyright infringement notices — see the DMCA process in our Terms of Service.",
  },
  {
    label: "Privacy",
    email: "privacy@getframe.app",
    description: "Data requests or questions about our Privacy Policy.",
  },
];

export default function ContactPage() {
  return (
    <LegalPage title="Contact" updated="August 4, 2026">
      <DraftNotice />
      <p className="text-xs text-text-secondary -mt-2">
        Placeholder addresses below — swap in real inboxes before launch.
      </p>

      <div className="flex flex-col gap-4 mt-2">
        {CHANNELS.map((c) => (
          <a
            key={c.email}
            href={`mailto:${c.email}`}
            className="flex items-start gap-3 rounded-xl border border-border px-4 py-3.5 hover:bg-card transition-colors no-underline"
          >
            <span className="w-9 h-9 rounded-full bg-card border border-border flex items-center justify-center shrink-0 mt-0.5">
              <Mail size={15} className="text-text-secondary" />
            </span>
            <span>
              <span className="block text-sm font-semibold text-accent">{c.label}</span>
              <span className="block text-xs text-primary mt-0.5">{c.email}</span>
              <span className="block text-xs text-text-secondary mt-1">{c.description}</span>
            </span>
          </a>
        ))}
      </div>
    </LegalPage>
  );
}
