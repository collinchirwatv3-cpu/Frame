import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { MotionConfig } from "framer-motion";
import { AuthListener } from "@/components/auth/AuthListener";
import { InviteGate } from "@/components/auth/InviteGate";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// The CSP (src/proxy.ts) is nonce-based with 'strict-dynamic', which per
// Next.js requires every page to be dynamically rendered — a nonce can only
// be generated and injected at request time, never baked into a statically
// prerendered page. Without this, statically-optimized routes ship script
// tags with no nonce while the CSP header carries a fresh one per request,
// so the browser blocks every script and the page renders blank.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "FRAME — Cinematic Landscape Video",
  description:
    "FRAME is the home for landscape creators. Every video full-screen and cinematic — 16:9, 21:9, and 16:10.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-bg text-accent overscroll-none">
        {/* Every Framer Motion animation in the app respects the OS-level
            reduced-motion setting from this one place, instead of needing to
            be threaded through individually. */}
        <AuthListener />
        <MotionConfig reducedMotion="user">
          <InviteGate>{children}</InviteGate>
        </MotionConfig>
      </body>
    </html>
  );
}
