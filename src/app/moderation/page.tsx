"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, ShieldAlert } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useIsModerator } from "@/lib/use-is-moderator";

type ReportRow = {
  id: string;
  reason: string;
  created_at: string;
  video: {
    id: string;
    title: string;
    poster_url: string | null;
    playback_url: string | null;
    visibility: string;
    profiles: { username: string } | null;
  } | null;
};

type Report = {
  id: string;
  reason: string;
  createdAt: string;
  video: {
    title: string;
    posterUrl: string | null;
    playbackUrl: string | null;
    visibility: string;
    creatorUsername: string;
  };
};

type Action = "dismiss" | "remove_video" | "ban_creator";

function toReports(rows: ReportRow[]): Report[] {
  return rows
    .filter((r): r is ReportRow & { video: NonNullable<ReportRow["video"]> } => r.video !== null)
    .map((r) => ({
      id: r.id,
      reason: r.reason,
      createdAt: r.created_at,
      video: {
        title: r.video.title,
        posterUrl: r.video.poster_url,
        playbackUrl: r.video.playback_url,
        visibility: r.video.visibility,
        creatorUsername: r.video.profiles?.username ?? "unknown",
      },
    }));
}

/**
 * Standalone (outside the (app) shell — no bottom nav/rail clutter, no
 * OnboardingGate blocking a moderator who hasn't onboarded themselves).
 * Gated client-side via useIsModerator, but that's UX only — every action
 * re-checks is_moderator server-side (see the route), and the pending-
 * reports query itself is RLS-scoped to moderators regardless of what this
 * component renders.
 */
export default function ModerationPage() {
  const status = useIsModerator();
  const [reports, setReports] = useState<Report[] | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<{ id: string; action: Action } | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status !== "moderator") return;
    let cancelled = false;
    const supabase = createClient();
    supabase
      .from("reports")
      .select(
        `id, reason, created_at,
         video:videos ( id, title, poster_url, playback_url, visibility, profiles!videos_creator_id_fkey ( username ) )`
      )
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .then(({ data }) => {
        if (cancelled) return;
        setReports(toReports((data ?? []) as unknown as ReportRow[]));
      });
    return () => {
      cancelled = true;
    };
  }, [status]);

  async function act(reportId: string, action: Action) {
    setPendingId(reportId);
    setError(null);
    try {
      const res = await fetch(`/api/moderation/reports/${reportId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? "That didn't work");
      setReports((prev) => prev?.filter((r) => r.id !== reportId) ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setPendingId(null);
      setConfirming(null);
    }
  }

  if (status === "loading") {
    return (
      <div className="flex items-center justify-center h-dvh">
        <Loader2 className="animate-spin text-text-secondary" />
      </div>
    );
  }

  if (status === "not-moderator") {
    return (
      <div className="flex flex-col items-center justify-center gap-3 h-dvh text-center px-6">
        <ShieldAlert size={32} className="text-text-secondary" />
        <p className="text-sm font-medium">You don&apos;t have access to this page</p>
        <Link href="/discover" className="text-xs text-primary underline underline-offset-2">
          Back to FRAMES
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-6 py-8 pb-24">
      <h1 className="text-xl font-bold mb-1">Moderation</h1>
      <p className="text-text-secondary text-sm mb-6">
        {reports === null
          ? "Loading reports…"
          : `${reports.length} pending report${reports.length === 1 ? "" : "s"}`}
      </p>

      {error && <p className="text-xs text-primary mb-4">{error}</p>}

      {reports?.length === 0 && (
        <p className="text-sm text-text-secondary">Nothing pending. You&apos;re caught up.</p>
      )}

      <div className="flex flex-col gap-4">
        {reports?.map((report) => (
          <div key={report.id} className="rounded-2xl border border-border bg-card overflow-hidden">
            <button
              type="button"
              onClick={() => setExpanded((e) => (e === report.id ? null : report.id))}
              className="w-full flex items-center gap-3 p-3 text-left"
            >
              {report.video.posterUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- internal tool, arbitrary user-owned thumbnail, not worth the optimizer's remote-pattern allowlist
                <img
                  src={report.video.posterUrl}
                  alt=""
                  className="w-20 aspect-video object-cover rounded-lg flex-shrink-0 bg-bg"
                />
              ) : (
                <div className="w-20 aspect-video rounded-lg bg-bg flex-shrink-0" />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{report.video.title}</p>
                <p className="text-xs text-text-secondary">
                  @{report.video.creatorUsername} · reported for{" "}
                  <span className="text-primary font-medium">{report.reason}</span>
                  {report.video.visibility === "private" && " · private video"}
                </p>
                <p className="text-[11px] text-text-secondary/70 mt-0.5">
                  {new Date(report.createdAt).toLocaleString()}
                </p>
              </div>
            </button>

            {expanded === report.id && (
              <div className="px-3 pb-3">
                {report.video.playbackUrl && (
                  <video
                    src={report.video.playbackUrl}
                    controls
                    className="w-full rounded-lg mb-3 bg-black"
                  />
                )}

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => act(report.id, "dismiss")}
                    disabled={pendingId === report.id}
                    className="px-3.5 py-2 rounded-full border border-border text-xs font-medium hover:bg-bg transition-colors disabled:opacity-40"
                  >
                    Dismiss
                  </button>

                  {confirming?.id === report.id && confirming.action === "remove_video" ? (
                    <button
                      type="button"
                      onClick={() => act(report.id, "remove_video")}
                      disabled={pendingId === report.id}
                      className="px-3.5 py-2 rounded-full bg-primary text-bg text-xs font-semibold disabled:opacity-70"
                    >
                      Confirm — permanently remove
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirming({ id: report.id, action: "remove_video" })}
                      disabled={pendingId === report.id}
                      className="px-3.5 py-2 rounded-full border border-primary/40 text-primary text-xs font-medium hover:bg-primary/10 transition-colors disabled:opacity-40"
                    >
                      Remove video
                    </button>
                  )}

                  {confirming?.id === report.id && confirming.action === "ban_creator" ? (
                    <button
                      type="button"
                      onClick={() => act(report.id, "ban_creator")}
                      disabled={pendingId === report.id}
                      className="px-3.5 py-2 rounded-full bg-primary text-bg text-xs font-semibold disabled:opacity-70"
                    >
                      Confirm — deletes their account
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirming({ id: report.id, action: "ban_creator" })}
                      disabled={pendingId === report.id}
                      className="px-3.5 py-2 rounded-full border border-primary/40 text-primary text-xs font-medium hover:bg-primary/10 transition-colors disabled:opacity-40"
                    >
                      Ban creator
                    </button>
                  )}

                  {pendingId === report.id && (
                    <Loader2 size={16} className="animate-spin text-text-secondary" />
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
