"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { AtSign, BadgeCheck, Check, Link as LinkIcon, MessageCircle, Settings, Sparkles, UploadCloud } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { EditProfileModal } from "@/components/profile/EditProfileModal";
import { formatCount, shareContent } from "@/lib/utils";
import { useEngagementStore } from "@/store/engagement-store";
import type { Creator } from "@/lib/types";

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-col items-center">
      <span className="font-bold text-lg">{formatCount(value)}</span>
      <span className="text-xs text-text-secondary">{label}</span>
    </div>
  );
}

export function ProfileHeader({
  creator,
  isCreator,
  videoCount,
  own = true,
}: {
  creator: Creator;
  isCreator: boolean;
  /** "Frames" stat — the count of videos the viewer is allowed to see for
   * this profile (public videos for someone else's profile, public videos
   * for the owner's own "Channel" count too — private ones don't count
   * toward the public-facing number). Passed in rather than fetched here
   * since both profile routes already have this count from their own
   * video fetch. */
  videoCount: number;
  /** False when viewing someone else's profile (/profile/[username]) —
   * hides Settings/Inbox/Edit Profile, shows Follow instead. */
  own?: boolean;
}) {
  const [shared, setShared] = useState(false);
  const [editing, setEditing] = useState(false);
  const following = useEngagementStore((s) => !!s.followedCreators[creator.id]);
  const toggleFollow = useEngagementStore((s) => s.toggleFollow);

  async function handleShare() {
    const url = `${window.location.origin}/profile${own ? "" : `/${creator.username}`}`;
    const result = await shareContent({
      title: `@${creator.username} on FRAMES`,
      text: creator.bio,
      url,
    });
    if (result === "shared" || result === "copied") {
      setShared(true);
      window.setTimeout(() => setShared(false), 1600);
    }
  }

  return (
    <div>
      <div className="relative h-36 md:h-48 w-full bg-card">
        {creator.bannerUrl && (
          <Image src={creator.bannerUrl} alt="" fill className="object-cover" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-bg via-transparent to-bg/20" />
        {own && (
          <Link
            href="/inbox"
            aria-label="Inbox"
            className="absolute top-4 left-4 w-9 h-9 rounded-full bg-bg/70 backdrop-blur-md flex items-center justify-center"
          >
            <MessageCircle size={16} />
          </Link>
        )}
        {own && (
          <div className="absolute top-4 right-4 flex items-center gap-2">
            {/* Upload's only other entry point is buried in
                StudioVideoGrid's empty-videos-tab CTA, only shown when the
                owner has zero public videos — this is the persistent one,
                always here regardless of catalog size, now that Upload
                isn't a primary nav destination anymore. */}
            <Link
              href="/upload"
              aria-label="Upload"
              className="w-9 h-9 rounded-full bg-bg/70 backdrop-blur-md flex items-center justify-center"
            >
              <UploadCloud size={16} />
            </Link>
            <Link
              href="/settings"
              aria-label="Settings"
              className="w-9 h-9 rounded-full bg-bg/70 backdrop-blur-md flex items-center justify-center"
            >
              <Settings size={16} />
            </Link>
          </div>
        )}
      </div>

      <div className="px-6 -mt-10 flex flex-col items-center text-center">
        <Avatar
          src={creator.avatarUrl}
          alt={creator.displayName}
          size={84}
          verified={creator.verified}
          className="ring-4 ring-bg rounded-full"
        />
        <div className="flex items-center gap-1.5 mt-3">
          <h1 className="text-xl font-bold">{creator.displayName}</h1>
          {creator.verified && <BadgeCheck size={16} className="text-primary shrink-0" aria-label="Verified" />}
        </div>
        <p className="text-text-secondary text-sm">@{creator.username}</p>

        <div className="flex items-center gap-1.5 mt-2 flex-wrap justify-center">
          {creator.premiumStatus === "active" && (
            <span className="flex items-center gap-1 text-[11px] font-semibold text-primary bg-primary/10 border border-primary/30 rounded-full px-3 py-1">
              <Sparkles size={11} />
              Premium
            </span>
          )}
          {creator.availableForHire && (
            <span className="text-[11px] font-semibold text-primary bg-primary/10 border border-primary/30 rounded-full px-3 py-1">
              Available for hire
            </span>
          )}
        </div>

        <p className="text-sm max-w-md mt-3 text-accent/90">{creator.bio}</p>

        {(creator.website || creator.instagramHandle) && (
          <div className="flex items-center gap-2 mt-3 flex-wrap justify-center">
            {creator.website && (
              <a
                href={`https://${creator.website}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1.5 text-xs font-medium bg-card border border-border rounded-full px-3 py-1.5 hover:bg-card/70 transition-colors"
              >
                <LinkIcon size={12} />
                {creator.website}
              </a>
            )}
            {creator.instagramHandle && (
              <a
                href={`https://instagram.com/${creator.instagramHandle}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1.5 text-xs font-medium bg-card border border-border rounded-full px-3 py-1.5 hover:bg-card/70 transition-colors"
              >
                <AtSign size={12} />
                {creator.instagramHandle}
              </a>
            )}
          </div>
        )}

        {creator.statement && (
          <blockquote className="max-w-md mt-4 text-sm italic text-accent/80 border-l-2 border-primary/50 pl-3 text-left">
            &ldquo;{creator.statement}&rdquo;
          </blockquote>
        )}

        {creator.equipment && creator.equipment.length > 0 && (
          <div className="flex flex-wrap justify-center gap-1.5 mt-4 max-w-md">
            {creator.equipment.map((item) => (
              <span
                key={item}
                className="text-[11px] text-text-secondary bg-card border border-border rounded-full px-2.5 py-1"
              >
                {item}
              </span>
            ))}
          </div>
        )}

        <div className="flex items-center gap-8 mt-5">
          <Stat value={videoCount} label="Frames" />
          <Stat value={creator.followers} label="Followers" />
          <Stat value={creator.following} label="Following" />
        </div>

        <div className="flex items-center gap-3 mt-5 w-full max-w-xs">
          {own ? (
            <button
              onClick={() => setEditing(true)}
              className="flex-1 py-2 rounded-full bg-primary text-bg text-sm font-semibold"
            >
              Edit Profile
            </button>
          ) : (
            <button
              onClick={() => toggleFollow(creator.id)}
              className={
                following
                  ? "flex-1 py-2 rounded-full border border-border text-sm font-medium hover:bg-card transition-colors"
                  : "flex-1 py-2 rounded-full bg-primary text-bg text-sm font-semibold"
              }
            >
              {following ? "Following" : "Follow"}
            </button>
          )}
          <div className="relative flex-1">
            <button
              onClick={handleShare}
              className="w-full py-2 rounded-full border border-border text-sm font-medium hover:bg-card transition-colors flex items-center justify-center gap-1.5"
            >
              {shared && <Check size={14} className="text-primary" />}
              {shared ? "Copied" : "Share"}
            </button>
            <AnimatePresence>
              {shared && (
                <motion.span
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="absolute left-1/2 -translate-x-1/2 top-full mt-2 whitespace-nowrap text-xs font-medium bg-card px-2.5 py-1 rounded-full"
                >
                  Profile link copied
                </motion.span>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {own && (
        <EditProfileModal open={editing} onClose={() => setEditing(false)} isCreator={isCreator} />
      )}
    </div>
  );
}
