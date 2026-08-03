import {
  AudioLines,
  Camera,
  MonitorPlay,
  Radar,
  RectangleHorizontal,
  ShieldCheck,
  SunMedium,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Badge } from "@/lib/types";

const BADGE_ICON: Record<Badge, React.ElementType> = {
  "FRAME Certified": ShieldCheck,
  "4K": MonitorPlay,
  HDR: SunMedium,
  "Dolby Vision": SunMedium,
  "Spatial Audio": AudioLines,
  "21:9 Cinema": RectangleHorizontal,
  Drone: Radar,
  "Shot on RED": Camera,
  "Shot on Sony": Camera,
  "Shot on Blackmagic": Camera,
};

// Roughly most- to least-impressive, for contexts that only show one badge.
const BADGE_PRIORITY: Badge[] = [
  "FRAME Certified",
  "21:9 Cinema",
  "4K",
  "Dolby Vision",
  "HDR",
  "Spatial Audio",
  "Drone",
  "Shot on RED",
  "Shot on Sony",
  "Shot on Blackmagic",
];

export function BadgeRow({
  badges,
  max,
  className,
}: {
  badges: Badge[];
  max?: number;
  className?: string;
}) {
  if (badges.length === 0) return null;

  const ordered = [...badges].sort(
    (a, b) => BADGE_PRIORITY.indexOf(a) - BADGE_PRIORITY.indexOf(b)
  );
  const shown = max ? ordered.slice(0, max) : ordered;

  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {shown.map((badge) => {
        const Icon = BADGE_ICON[badge];
        return (
          <span
            key={badge}
            className="flex items-center gap-1 bg-card/80 backdrop-blur-md border border-border rounded-full pl-1.5 pr-2.5 py-1 text-[11px] font-semibold text-accent"
          >
            <Icon size={11} className="text-primary" />
            {badge}
          </span>
        );
      })}
    </div>
  );
}
