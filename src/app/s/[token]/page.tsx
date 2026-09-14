import { ExpiredLinkNotice } from "@/components/share/ExpiredLinkNotice";

// Private share links require a server-backed token resolver. The old demo
// resolved localStorage tokens against bundled videos and never shared real content.
export default function SharedVideoPage() {
  return <ExpiredLinkNotice reason="not-found" />;
}
