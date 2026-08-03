"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { CHROME_FADE_TRANSITION } from "@/lib/motion";
import { navItems } from "./nav-items";
import { currentUser } from "@/lib/mock-data";
import { Logo } from "@/components/ui/Logo";
import { usePlayerStore } from "@/store/player-store";

export function SideRail() {
  const pathname = usePathname();
  const directorMode = usePlayerStore((s) => s.directorMode);

  return (
    <motion.aside
      animate={{ opacity: directorMode ? 0 : 1, width: directorMode ? 0 : 240 }}
      transition={CHROME_FADE_TRANSITION}
      className={cn(
        "hidden md:flex flex-col justify-between shrink-0 overflow-hidden h-screen sticky top-0 border-r border-border px-4 py-6",
        directorMode && "pointer-events-none border-r-0"
      )}
    >
      <div>
        <Link href="/" className="flex items-center gap-2 px-2 mb-10">
          <Logo size={28} />
          <span className="text-lg font-bold tracking-tight">FRAME</span>
        </Link>

        <ul className="flex flex-col gap-1">
          {navItems.map(({ href, label, icon: Icon }) => {
            const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
            return (
              <li key={href}>
                <Link
                  href={href}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors",
                    active
                      ? "bg-card text-accent"
                      : "text-text-secondary hover:text-accent hover:bg-card/60"
                  )}
                >
                  <Icon size={20} strokeWidth={active ? 2.5 : 1.75} />
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>

      <Link
        href="/profile"
        className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-card/60 transition-colors"
      >
        <Image
          src={currentUser.avatarUrl}
          alt={currentUser.displayName}
          width={32}
          height={32}
          className="rounded-full object-cover"
        />
        <div className="min-w-0">
          <p className="text-sm font-medium truncate">{currentUser.displayName}</p>
          <p className="text-xs text-text-secondary truncate">@{currentUser.username}</p>
        </div>
      </Link>
    </motion.aside>
  );
}
