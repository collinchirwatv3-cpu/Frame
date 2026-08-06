import { Compass, Flame, Home, UploadCloud } from "lucide-react";

// Profile and Inbox are deliberately not here — reached via icons instead
// (an avatar icon in the feed opens Profile, a message icon on Profile
// opens Inbox), not as standalone rail/bottom-nav destinations.
export const navItems = [
  { href: "/", label: "Home", icon: Home },
  { href: "/discover", label: "Discover", icon: Compass },
  { href: "/shorts", label: "Shorts", icon: Flame },
  { href: "/upload", label: "Upload", icon: UploadCloud },
] as const;
