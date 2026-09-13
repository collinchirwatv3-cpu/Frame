import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Fraunces } from "next/font/google";
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

// Display serif for page titles only (Discover, Frame Parties, etc.) —
// everything else (body copy, nav labels, buttons) stays on Geist. Exposed
// as --font-serif / the `font-serif` Tailwind utility via globals.css.
const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  style: ["normal", "italic"],
});

// The CSP (src/proxy.ts) is nonce-based with 'strict-dynamic', which per
// Next.js requires every page to be dynamically rendered — a nonce can only
// be generated and injected at request time, never baked into a statically
// prerendered page. Without this, statically-optimized routes ship script
// tags with no nonce while the CSP header carries a fresh one per request,
// so the browser blocks every script and the page renders blank.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "FRAMES — Cinematic Landscape Frames",
  description:
    "FRAMES is the home for landscape creators. Every Frame full-screen and cinematic — 16:9, 21:9, and 16:10.",
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
};

// viewportFit: "cover" is what makes env(safe-area-inset-*) resolve to real
// values instead of 0 — required once this runs full-screen with no browser
// chrome (a Capacitor-wrapped WKWebView, or an installed PWA).
export const viewport: Viewport = {
  themeColor: "#090909",
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${fraunces.variable} h-full antialiased`}
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
