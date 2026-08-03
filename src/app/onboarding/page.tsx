"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { categories } from "@/lib/mock-data";
import { useOnboardingStore } from "@/store/onboarding-store";
import { Logo } from "@/components/ui/Logo";
import { DURATION } from "@/lib/motion";
import type { Category } from "@/lib/types";

export default function OnboardingPage() {
  const router = useRouter();
  const hasHydrated = useOnboardingStore((s) => s.hasHydrated);
  const completed = useOnboardingStore((s) => s.completed);
  const complete = useOnboardingStore((s) => s.complete);
  const [step, setStep] = useState<"intro" | "interests">("intro");
  const [selected, setSelected] = useState<Category[]>([]);

  // Already onboarded and landed here directly — bounce back to the feed.
  useEffect(() => {
    if (hasHydrated && completed) router.replace("/");
  }, [hasHydrated, completed, router]);

  function toggle(category: Category) {
    setSelected((prev) =>
      prev.includes(category) ? prev.filter((c) => c !== category) : [...prev, category]
    );
  }

  function finish(interests: Category[]) {
    complete(interests);
    router.replace("/");
  }

  if (!hasHydrated || completed) return null;

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center px-6 py-16">
      <AnimatePresence mode="wait">
        {step === "intro" ? (
          <motion.div
            key="intro"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: DURATION.base }}
            className="w-full max-w-md text-center"
          >
            <div className="flex items-center gap-2 justify-center mb-8">
              <Logo size={32} />
              <span className="text-2xl font-bold tracking-tight">FRAME</span>
            </div>

            <h1 className="text-2xl font-bold leading-snug">
              The cinematic social network
            </h1>
            <p className="text-text-secondary text-sm mt-4 leading-relaxed">
              FRAME exists for landscape storytelling — 16:9, 21:9 Cinema, 16:10.
              No portrait video, no black bars, no infinite doomscroll. Every swipe
              takes you to another scene, like walking through a film festival that
              never ends.
            </p>

            <button
              onClick={() => setStep("interests")}
              className="w-full mt-10 py-3 rounded-full bg-primary text-bg text-sm font-semibold"
            >
              Continue
            </button>
          </motion.div>
        ) : (
          <motion.div
            key="interests"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: DURATION.base }}
            className="w-full max-w-md"
          >
            <div className="flex items-center gap-2 justify-center mb-8">
              <Logo size={32} />
              <span className="text-2xl font-bold tracking-tight">FRAME</span>
            </div>

            <h1 className="text-xl font-bold text-center">What do you love watching?</h1>
            <p className="text-text-secondary text-sm text-center mt-2">
              Pick a few — you can change this anytime from Settings.
            </p>

            <div className="flex flex-wrap gap-2 justify-center mt-8">
              {categories.map((c) => {
                const active = selected.includes(c);
                return (
                  <button
                    key={c}
                    onClick={() => toggle(c)}
                    aria-pressed={active}
                    className={cn(
                      "px-4 py-2 rounded-full text-sm font-medium border transition-colors",
                      active
                        ? "bg-primary text-bg border-primary"
                        : "border-border text-text-secondary hover:text-accent hover:border-accent/40"
                    )}
                  >
                    {c}
                  </button>
                );
              })}
            </div>

            <button
              onClick={() => finish(selected)}
              disabled={selected.length === 0}
              className="w-full mt-10 py-3 rounded-full bg-primary text-bg text-sm font-semibold disabled:opacity-40 transition-opacity"
            >
              Continue
            </button>
            <button
              onClick={() => finish([])}
              className="w-full mt-3 py-2 text-sm text-text-secondary hover:text-accent transition-colors"
            >
              Skip for now
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
