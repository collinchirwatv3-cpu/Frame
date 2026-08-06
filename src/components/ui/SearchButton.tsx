import Link from "next/link";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";

/** The one consistent "find something else" affordance — every page links
 * to /search from here, styled to fit wherever it's dropped (an overlay
 * cluster on video chrome, or inline in a page header). */
export function SearchButton({ className }: { className?: string }) {
  return (
    <Link
      href="/search"
      aria-label="Search"
      className={cn(
        "w-9 h-9 rounded-full bg-card/70 backdrop-blur-md flex items-center justify-center shrink-0",
        className
      )}
    >
      <Search size={16} />
    </Link>
  );
}
