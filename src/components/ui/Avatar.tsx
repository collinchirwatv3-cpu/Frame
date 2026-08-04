import Image from "next/image";
import { BadgeCheck, UserCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function Avatar({
  src,
  alt,
  size = 40,
  verified = false,
  ring = false,
  className,
}: {
  src: string;
  alt: string;
  size?: number;
  verified?: boolean;
  ring?: boolean;
  className?: string;
}) {
  return (
    <span className={cn("relative inline-block shrink-0", className)} style={{ width: size, height: size }}>
      {src ? (
        <Image
          src={src}
          alt={alt}
          width={size}
          height={size}
          className={cn(
            "rounded-full object-cover w-full h-full",
            ring && "ring-2 ring-primary ring-offset-2 ring-offset-bg"
          )}
        />
      ) : (
        <UserCircle2
          size={size}
          className={cn(
            "text-text-secondary w-full h-full",
            ring && "ring-2 ring-primary ring-offset-2 ring-offset-bg rounded-full"
          )}
        />
      )}
      {verified && (
        <BadgeCheck
          size={Math.max(14, size * 0.32)}
          className="absolute -bottom-0.5 -right-0.5 text-primary fill-bg"
          strokeWidth={2.5}
        />
      )}
    </span>
  );
}
