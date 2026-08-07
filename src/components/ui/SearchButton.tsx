import Link from "next/link";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { CHROME_GLASS_CLASS, CHROME_TAP_SCALE_CLASS } from "@/lib/chrome";

/** The one consistent "find something else" affordance — every page links
 * to /search from here, styled to fit wherever it's dropped (an overlay
 * cluster on video chrome, or inline in a page header). Some callers
 * override the background here (e.g. settings/inbox's opaque page header
 * wants `bg-card` instead of the translucent video-chrome default) — kept
 * as one element with `className` merged on top via `cn`, not a wrapper,
 * so those overrides keep landing on the actual visual surface. */
export function SearchButton({ className }: { className?: string }) {
  return (
    <Link
      href="/search"
      aria-label="Search"
      className={cn(
        CHROME_GLASS_CLASS,
        CHROME_TAP_SCALE_CLASS,
        "w-9 h-9 flex items-center justify-center shrink-0",
        className
      )}
    >
      <Search size={16} />
    </Link>
  );
}
