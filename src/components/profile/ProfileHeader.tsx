"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Link as LinkIcon, MessageCircle, Settings } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { EditProfileModal } from "@/components/profile/EditProfileModal";
import { formatCount, shareContent } from "@/lib/utils";
import type { Creator } from "@/lib/types";

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-col items-center">
      <span className="font-bold text-lg">{formatCount(value)}</span>
      <span className="text-xs text-text-secondary">{label}</span>
    </div>
  );
}

export function ProfileHeader({ creator, isCreator }: { creator: Creator; isCreator: boolean }) {
  const [shared, setShared] = useState(false);
  const [editing, setEditing] = useState(false);

  async function handleShare() {
    const url = `${window.location.origin}/profile`;
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
        <Link
          href="/inbox"
          aria-label="Inbox"
          className="absolute top-4 left-4 w-9 h-9 rounded-full bg-bg/70 backdrop-blur-md flex items-center justify-center"
        >
          <MessageCircle size={16} />
        </Link>
        <Link
          href="/settings"
          aria-label="Settings"
          className="absolute top-4 right-4 w-9 h-9 rounded-full bg-bg/70 backdrop-blur-md flex items-center justify-center"
        >
          <Settings size={16} />
        </Link>
      </div>

      <div className="px-6 -mt-10 flex flex-col items-center text-center">
        <Avatar
          src={creator.avatarUrl}
          alt={creator.displayName}
          size={84}
          verified={creator.verified}
          className="ring-4 ring-bg rounded-full"
        />
        <h1 className="text-xl font-bold mt-3">{creator.displayName}</h1>
        <p className="text-text-secondary text-sm">@{creator.username}</p>
        {creator.availableForHire && (
          <span className="mt-2 text-[11px] font-semibold text-primary bg-primary/10 border border-primary/30 rounded-full px-3 py-1">
            Available for hire
          </span>
        )}

        <p className="text-sm max-w-md mt-3 text-accent/90">{creator.bio}</p>
        {creator.website && (
          <a
            href={`https://${creator.website}`}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 text-primary text-sm mt-2"
          >
            <LinkIcon size={13} />
            {creator.website}
          </a>
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
          <Stat value={creator.followers} label="Followers" />
          <Stat value={creator.following} label="Following" />
          <Stat value={creator.totalViews} label="Views" />
        </div>

        <div className="flex items-center gap-3 mt-5 w-full max-w-xs">
          <button
            onClick={() => setEditing(true)}
            className="flex-1 py-2 rounded-full bg-primary text-bg text-sm font-semibold"
          >
            Edit Profile
          </button>
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

      <EditProfileModal open={editing} onClose={() => setEditing(false)} isCreator={isCreator} />
    </div>
  );
}
