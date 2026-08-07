import { Clapperboard, Compass, Search, Users, User } from "lucide-react";

// Inbox is still not here — reached only via the icon in ProfileHeader.tsx,
// not as a standalone nav destination. Everything else (including Profile,
// previously deliberately excluded) is a real primary destination now.
export const navItems = [
  { href: "/shorts", label: "Shorts", icon: Clapperboard },
  { href: "/discover", label: "Discover", icon: Compass },
  { href: "/search", label: "Search", icon: Search },
  { href: "/parties", label: "Parties", icon: Users },
  { href: "/profile", label: "Profile", icon: User },
] as const;
