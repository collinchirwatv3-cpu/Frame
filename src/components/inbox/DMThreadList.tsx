import { MessageCircle } from "lucide-react";

// Direct messages have no backend at all yet (deferred out of the App Store
// push-notifications milestone — see the plan file's "DMs stay deferred"
// decision). This used to render mock thread data with dead, non-functional
// tap targets; an honest "coming soon" state is correct until a real DM
// table/thread UI exists, not a feature that only looks alive.
export function DMThreadList() {
  return (
    <div className="flex flex-col items-center gap-3 text-center py-16 px-6">
      <span className="w-12 h-12 rounded-full bg-card border border-border flex items-center justify-center">
        <MessageCircle size={20} className="text-text-secondary" />
      </span>
      <p className="text-sm font-medium">Direct messages are coming soon</p>
      <p className="text-xs text-text-secondary max-w-[220px]">
        You&apos;ll be able to message creators and followers directly from here.
      </p>
    </div>
  );
}
