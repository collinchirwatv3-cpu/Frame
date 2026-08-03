import { Compass, Home, MessageCircle, UploadCloud, User } from "lucide-react";

export const navItems = [
  { href: "/", label: "Home", icon: Home },
  { href: "/explore", label: "Explore", icon: Compass },
  { href: "/upload", label: "Upload", icon: UploadCloud },
  { href: "/inbox", label: "Inbox", icon: MessageCircle },
  { href: "/profile", label: "Profile", icon: User },
] as const;
