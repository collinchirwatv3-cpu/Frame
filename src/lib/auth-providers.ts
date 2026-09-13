/** Which OAuth providers are actually configured in Supabase right now.
 * Apple isn't enabled yet (no Apple Developer/Supabase credentials) —
 * clicking it today returns a real 400 "provider is not enabled" from
 * Supabase, not a FRAME bug. Flip this to true the moment Apple sign-in is
 * configured in the Supabase dashboard — that's the entire change needed;
 * login/page.tsx already renders the disabled state generically off this
 * flag rather than hardcoding Apple's disabled-ness. */
export const OAUTH_PROVIDERS_ENABLED = {
  google: true,
  apple: false,
} as const;
