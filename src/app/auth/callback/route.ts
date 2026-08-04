import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * PKCE code-exchange endpoint — @supabase/ssr defaults to `flowType: "pkce"`,
 * so OAuth (Google/Apple) and magic-link redirects land here with a `?code=`
 * param that must be exchanged for a session server-side before the cookie
 * exists. Without this route, login/page.tsx's `redirectTo`s point straight
 * at the app with no code exchange and the user never actually gets signed in.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth`);
}
