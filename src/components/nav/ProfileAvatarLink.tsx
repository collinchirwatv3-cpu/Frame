import Link from "next/link";
import { UserCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/ui/Avatar";
import { useCurrentUserStore } from "@/store/current-user-store";
import { CHROME_GLASS_CLASS, CHROME_TAP_SCALE_CLASS } from "@/lib/chrome";

/** The actual avatar/login circle, with no positioning of its own — shared
 * by ProfileFloat (fixed, floats over video chrome) and Home's own inline
 * header (sits in normal flow, next to the FRAMES logo, at the same
 * baseline rather than floating separately). Same glass-button look as
 * SearchButton/the nav rail — a real photo avatar mostly hides it behind
 * the image, but the login/no-avatar state (bare UserCircle2 icon) reads
 * as the same chrome-button family as everything else instead of a
 * one-off. */
export function ProfileAvatarLink({ className }: { className?: string }) {
  const profile = useCurrentUserStore((s) => s.profile);

  return (
    <Link
      href={profile ? "/profile" : "/login"}
      aria-label={profile ? "Your profile" : "Log in"}
      className={cn(
        CHROME_GLASS_CLASS,
        CHROME_TAP_SCALE_CLASS,
        "flex items-center justify-center w-9 h-9 overflow-hidden shrink-0",
        className
      )}
    >
      {profile ? (
        <Avatar src={profile.avatarUrl} alt={profile.displayName} size={36} className="w-full h-full" />
      ) : (
        <UserCircle2 size={20} />
      )}
    </Link>
  );
}
