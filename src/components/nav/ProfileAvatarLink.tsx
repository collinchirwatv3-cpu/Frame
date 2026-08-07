import Link from "next/link";
import { UserCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/ui/Avatar";
import { useCurrentUserStore } from "@/store/current-user-store";

/** The actual avatar/login circle, with no positioning of its own — shared
 * by ProfileFloat (fixed, floats over video chrome) and Home's own inline
 * header (sits in normal flow, next to the FRAMES logo, at the same
 * baseline rather than floating separately). */
export function ProfileAvatarLink({ className }: { className?: string }) {
  const profile = useCurrentUserStore((s) => s.profile);

  return (
    <Link
      href={profile ? "/profile" : "/login"}
      aria-label={profile ? "Your profile" : "Log in"}
      className={cn(
        "flex items-center justify-center w-9 h-9 rounded-full bg-card/70 backdrop-blur-md overflow-hidden ring-2 ring-bg/70 shrink-0",
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
