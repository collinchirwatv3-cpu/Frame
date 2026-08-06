import Image from "next/image";
import Link from "next/link";
import { Clock, ShieldOff } from "lucide-react";
import { Logo } from "@/components/ui/Logo";
import { Avatar } from "@/components/ui/Avatar";
import type { Creator } from "@/lib/types";

export function ExpiredLinkNotice({
  reason,
  creator,
  posterUrl,
}: {
  reason: "expired" | "revoked" | "not-found";
  creator?: Creator;
  posterUrl?: string;
}) {
  const Icon = reason === "revoked" ? ShieldOff : Clock;
  const headline =
    reason === "not-found"
      ? "This link doesn't exist"
      : reason === "revoked"
        ? "This link was revoked"
        : "This preview has expired";

  return (
    <div className="relative min-h-dvh flex flex-col items-center justify-center px-6 overflow-hidden">
      {posterUrl && (
        <div className="absolute inset-0">
          <Image
            src={posterUrl}
            alt=""
            fill
            className="object-cover scale-125 blur-3xl opacity-25"
          />
          <div className="absolute inset-0 bg-bg/70" />
        </div>
      )}

      <div className="relative flex flex-col items-center text-center gap-4 max-w-sm">
        <div className="flex items-center gap-2 mb-2">
          <Logo size={28} />
          <span className="text-lg font-bold tracking-tight">FRAMES</span>
        </div>

        <span className="w-14 h-14 rounded-full bg-card border border-border flex items-center justify-center">
          <Icon size={22} className="text-text-secondary" />
        </span>

        <h1 className="text-xl font-bold">{headline}</h1>

        {creator ? (
          <>
            <div className="flex items-center gap-2 mt-1">
              <Avatar src={creator.avatarUrl} alt={creator.displayName} size={28} />
              <p className="text-sm text-text-secondary">
                Shared by <span className="text-accent font-medium">@{creator.username}</span>
              </p>
            </div>
            <p className="text-sm text-text-secondary">
              Sign up for FRAMES to watch {creator.displayName}&apos;s videos and everything else on the
              platform.
            </p>
          </>
        ) : (
          <p className="text-sm text-text-secondary">
            The person who shared this may have revoked it, or the link&apos;s simply too old.
          </p>
        )}

        <Link
          href="/login"
          className="w-full mt-2 py-3 rounded-full bg-primary text-bg text-sm font-semibold"
        >
          Sign up for FRAMES
        </Link>
      </div>
    </div>
  );
}
