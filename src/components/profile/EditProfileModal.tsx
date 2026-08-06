"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { AnimatePresence, motion } from "framer-motion";
import { Camera, Loader2, UserCircle2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useCurrentUserStore } from "@/store/current-user-store";
import { profileEditSchema, ACCEPTED_IMAGE_TYPES, MAX_IMAGE_BYTES } from "@/lib/validation/profile";
import { cn } from "@/lib/utils";

type PendingImage = { file: File; previewUrl: string };

function validateImage(file: File): string | null {
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) return "Use a JPEG, PNG, or WebP image.";
  if (file.size > MAX_IMAGE_BYTES) return "Image must be under 8MB.";
  return null;
}

export function EditProfileModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const profile = useCurrentUserStore((s) => s.profile);
  const setProfile = useCurrentUserStore((s) => s.setProfile);
  const inviteRedeemedAt = useCurrentUserStore((s) => s.inviteRedeemedAt);

  const [username, setUsername] = useState(profile?.username ?? "");
  const [displayName, setDisplayName] = useState(profile?.displayName ?? "");
  const [bio, setBio] = useState(profile?.bio ?? "");
  const [avatar, setAvatar] = useState<PendingImage | null>(null);
  const [banner, setBanner] = useState<PendingImage | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const avatarInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);

  if (!profile) return null;
  const currentProfile = profile;

  function resetAndClose() {
    if (saving) return;
    setUsername(currentProfile.username);
    setDisplayName(currentProfile.displayName);
    setBio(currentProfile.bio);
    if (avatar) URL.revokeObjectURL(avatar.previewUrl);
    if (banner) URL.revokeObjectURL(banner.previewUrl);
    setAvatar(null);
    setBanner(null);
    setError("");
    onClose();
  }

  function pickImage(kind: "avatar" | "banner", file: File | undefined) {
    if (!file) return;
    const issue = validateImage(file);
    if (issue) {
      setError(issue);
      return;
    }
    setError("");
    const previewUrl = URL.createObjectURL(file);
    if (kind === "avatar") setAvatar({ file, previewUrl });
    else setBanner({ file, previewUrl });
  }

  async function uploadImage(kind: "avatar" | "banner", file: File, userId: string) {
    const supabase = createClient();
    const ext = file.name.split(".").pop() || "jpg";
    const path = `${userId}/${kind}-${Date.now()}.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from("profile-media")
      .upload(path, file, { contentType: file.type, upsert: true });
    if (uploadError) throw new Error(`Couldn't upload ${kind}. Try again.`);
    return supabase.storage.from("profile-media").getPublicUrl(path).data.publicUrl;
  }

  async function handleSave() {
    const parsed = profileEditSchema.safeParse({ username, displayName, bio, website: "" });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the fields above.");
      return;
    }

    setSaving(true);
    setError("");

    try {
      const supabase = createClient();
      const updates: Record<string, string> = {};

      if (parsed.data.username !== currentProfile.username) updates.username = parsed.data.username;
      if (parsed.data.displayName !== currentProfile.displayName)
        updates.display_name = parsed.data.displayName;
      if (parsed.data.bio !== currentProfile.bio) updates.bio = parsed.data.bio;

      if (avatar) updates.avatar_url = await uploadImage("avatar", avatar.file, currentProfile.id);
      if (banner) updates.banner_url = await uploadImage("banner", banner.file, currentProfile.id);

      if (Object.keys(updates).length === 0) {
        resetAndClose();
        return;
      }

      const { data, error: updateError } = await supabase
        .from("profiles")
        .update(updates)
        .eq("id", currentProfile.id)
        .select()
        .single();

      if (updateError) {
        if (updateError.code === "23505") {
          setError("That username is taken.");
        } else {
          setError("Couldn't save your profile. Try again.");
        }
        setSaving(false);
        return;
      }

      setProfile(
        {
          ...currentProfile,
          username: data.username,
          displayName: data.display_name,
          bio: data.bio,
          avatarUrl: data.avatar_url ?? "",
          bannerUrl: data.banner_url ?? "",
        },
        inviteRedeemedAt
      );
      if (avatar) URL.revokeObjectURL(avatar.previewUrl);
      if (banner) URL.revokeObjectURL(banner.previewUrl);
      setSaving(false);
      setAvatar(null);
      setBanner(null);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setSaving(false);
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={resetAndClose}
            className="fixed inset-0 bg-bg/70 backdrop-blur-sm z-[60]"
          />
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 320, damping: 34 }}
            className="fixed inset-x-0 bottom-0 z-[61] flex flex-col bg-card border-t border-border rounded-t-2xl max-h-[90vh] overflow-y-auto md:max-w-md md:left-1/2 md:-translate-x-1/2 md:bottom-6 md:rounded-2xl md:border"
            style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 1.5rem)" }}
          >
            <div className="flex items-center justify-between px-6 pt-6 pb-2">
              <h2 className="text-base font-semibold">Edit profile</h2>
              <button
                type="button"
                onClick={resetAndClose}
                aria-label="Close"
                className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-bg transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            <div className="relative h-32 w-full bg-bg mt-2">
              {(banner?.previewUrl || currentProfile.bannerUrl) && (
                <Image
                  src={banner?.previewUrl || currentProfile.bannerUrl}
                  alt=""
                  fill
                  unoptimized={!!banner?.previewUrl}
                  className="object-cover"
                />
              )}
              <button
                type="button"
                onClick={() => bannerInputRef.current?.click()}
                aria-label="Change banner image"
                className="absolute inset-0 flex items-center justify-center bg-bg/40 hover:bg-bg/55 transition-colors"
              >
                <Camera size={20} className="text-white" />
              </button>
              <input
                ref={bannerInputRef}
                type="file"
                accept={ACCEPTED_IMAGE_TYPES.join(",")}
                className="hidden"
                onChange={(e) => pickImage("banner", e.target.files?.[0])}
              />

              <div className="absolute left-6 -bottom-8">
                <button
                  type="button"
                  onClick={() => avatarInputRef.current?.click()}
                  aria-label="Change avatar image"
                  className="relative w-16 h-16 rounded-full ring-4 ring-card overflow-hidden bg-card flex items-center justify-center"
                >
                  {avatar?.previewUrl || currentProfile.avatarUrl ? (
                    <Image
                      src={avatar?.previewUrl || currentProfile.avatarUrl}
                      alt=""
                      fill
                      unoptimized={!!avatar?.previewUrl}
                      className="object-cover"
                    />
                  ) : (
                    <UserCircle2 size={64} className="text-text-secondary" />
                  )}
                  <span className="absolute inset-0 flex items-center justify-center bg-bg/40 hover:bg-bg/55 transition-colors">
                    <Camera size={16} className="text-white" />
                  </span>
                </button>
                <input
                  ref={avatarInputRef}
                  type="file"
                  accept={ACCEPTED_IMAGE_TYPES.join(",")}
                  className="hidden"
                  onChange={(e) => pickImage("avatar", e.target.files?.[0])}
                />
              </div>
            </div>

            <div className="flex flex-col gap-4 px-6 pt-12 pb-2">
              <label className="flex flex-col gap-1.5">
                <span className="text-xs text-text-secondary">Display name</span>
                <input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  disabled={saving}
                  maxLength={50}
                  className="bg-bg border border-border rounded-xl px-4 py-2.5 text-sm outline-none focus:border-primary transition-colors disabled:opacity-50"
                />
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="text-xs text-text-secondary">Username</span>
                <div className="flex items-center bg-bg border border-border rounded-xl px-4 py-2.5 focus-within:border-primary transition-colors">
                  <span className="text-text-secondary text-sm">@</span>
                  <input
                    value={username}
                    onChange={(e) => setUsername(e.target.value.toLowerCase())}
                    disabled={saving}
                    maxLength={24}
                    autoCapitalize="off"
                    autoCorrect="off"
                    className="flex-1 bg-transparent text-sm outline-none disabled:opacity-50"
                  />
                </div>
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="text-xs text-text-secondary flex justify-between">
                  Bio
                  <span className={cn(bio.length > 280 && "text-primary")}>{bio.length}/280</span>
                </span>
                <textarea
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  disabled={saving}
                  maxLength={280}
                  rows={3}
                  className="bg-bg border border-border rounded-xl px-4 py-2.5 text-sm outline-none focus:border-primary transition-colors resize-none disabled:opacity-50"
                />
              </label>

              {error && (
                <p role="alert" className="text-xs text-primary">
                  {error}
                </p>
              )}
            </div>

            <div className="flex gap-3 px-6 pt-3">
              <button
                type="button"
                onClick={resetAndClose}
                disabled={saving}
                className="flex-1 py-2.5 rounded-full border border-border text-sm font-medium hover:bg-bg transition-colors disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="flex-1 py-2.5 rounded-full bg-primary text-bg text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-40"
              >
                {saving && <Loader2 size={16} className="animate-spin" />}
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
