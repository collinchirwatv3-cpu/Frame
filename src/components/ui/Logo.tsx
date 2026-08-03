import { cn } from "@/lib/utils";

function CameraGlyph({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-bg"
    >
      {/* body */}
      <rect x="4" y="4" width="12" height="9" rx="2" />
      {/* lens */}
      <circle cx="17.5" cy="8.5" r="2.5" />
      {/* tripod */}
      <path d="M9 13 4 21" />
      <path d="M12 13v9" />
      <path d="M14 13l4 8" />
    </svg>
  );
}

export function Logo({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <span
      className={cn("inline-flex items-center justify-center rounded-lg bg-primary shrink-0", className)}
      style={{ width: size, height: size }}
    >
      <CameraGlyph size={size * 0.62} />
    </span>
  );
}
