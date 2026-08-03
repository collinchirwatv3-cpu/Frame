import { AtSign, Bell, Heart, MessageCircle, UserPlus } from "lucide-react";
import { notificationSummary } from "@/lib/mock-data";

const ICONS = {
  likes: Heart,
  comments: MessageCircle,
  followers: UserPlus,
  mentions: AtSign,
  system: Bell,
} as const;

export function NotificationSummary() {
  return (
    <div className="flex gap-3 overflow-x-auto no-scrollbar px-6 pb-1">
      {notificationSummary.map((n) => {
        const Icon = ICONS[n.id as keyof typeof ICONS];
        return (
          <button
            key={n.id}
            className="shrink-0 flex items-center gap-2 bg-card border border-border rounded-full pl-2.5 pr-3.5 py-2"
          >
            <span className="w-7 h-7 rounded-full bg-primary/15 text-primary flex items-center justify-center">
              <Icon size={14} />
            </span>
            <span className="text-sm font-medium">{n.label}</span>
            {n.count > 0 && <span className="text-xs text-text-secondary">{n.count}</span>}
          </button>
        );
      })}
    </div>
  );
}
