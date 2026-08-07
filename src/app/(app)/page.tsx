import { redirect } from "next/navigation";

// The shelf feed that used to live here moved into /discover as part of the
// 5-tab nav rebuild (Shorts/Discover/Search/Parties/Profile) — there's no
// separate Home destination anymore. This redirect exists so `/` (bookmarks,
// external links, onboarding's router.replace("/")) keeps working rather
// than 404ing.
export default function HomePage() {
  redirect("/discover");
}
