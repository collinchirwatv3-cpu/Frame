// Direct messages have no backend at all yet (deferred out of the App Store
// push-notifications milestone — see the plan file's "DMs stay deferred"
// decision). Previously a full centered panel (icon + heading + subtext),
// which made the real notification feed above it read as unfinished by
// comparison — shrunk to a single small, non-interactive line per the
// Notifications + Inbox brief, rather than removed outright, so it's still
// honest about what's coming without competing with real content for
// attention.
export function DMThreadList() {
  return <p className="text-center text-[11px] text-text-secondary py-4">Direct messages are coming soon.</p>;
}
