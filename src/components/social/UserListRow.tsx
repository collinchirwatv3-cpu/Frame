import Link from "next/link";
import { Avatar } from "@/components/ui/Avatar";
import type { FollowProfile } from "@/lib/social";

/** One row in a Followers/Following/Blocked list — avatar, name, username,
 * and a caller-supplied action slot (FollowButton, an Unblock button, or
 * nothing). `linkToProfile` is off for the Blocked Accounts list: a
 * blocked profile is unreachable via RLS once blocked, so linking there
 * would just land on the "couldn't find" state. */
export function UserListRow({
  user,
  action,
  linkToProfile = true,
}: {
  user: FollowProfile;
  action?: React.ReactNode;
  linkToProfile?: boolean;
}) {
  const identity = (
    <>
      <Avatar src={user.avatarUrl} alt={user.displayName} size={44} verified={user.verified} />
      <div className="min-w-0">
        <p className="text-sm font-semibold truncate">{user.displayName}</p>
        <p className="text-xs text-text-secondary truncate">@{user.username}</p>
      </div>
    </>
  );

  return (
    <div className="flex items-center gap-3 px-6 py-3">
      {linkToProfile ? (
        <Link href={`/profile/${user.username}`} className="flex items-center gap-3 flex-1 min-w-0">
          {identity}
        </Link>
      ) : (
        <div className="flex items-center gap-3 flex-1 min-w-0">{identity}</div>
      )}
      {action}
    </div>
  );
}
