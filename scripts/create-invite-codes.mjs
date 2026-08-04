// Generates invite codes for the closed alpha and inserts them directly
// (invite_codes has no client-facing RLS policies on purpose — this is the
// intended way to create them, alongside the Supabase SQL Editor).
//
//   node --env-file=.env.local scripts/create-invite-codes.mjs 25
//   node --env-file=.env.local scripts/create-invite-codes.mjs 5 --uses=3 --note="press batch"

import { createClient } from "@supabase/supabase-js";

const count = Number(process.argv[2]) || 1;
const usesArg = process.argv.find((a) => a.startsWith("--uses="));
const noteArg = process.argv.find((a) => a.startsWith("--note="));
const maxUses = usesArg ? Number(usesArg.split("=")[1]) : 1;
const note = noteArg ? noteArg.split("=")[1] : null;

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env.");
  process.exit(1);
}

// Avoids visually ambiguous characters (0/O, 1/I/L) since these get typed
// by hand into a phone keyboard, not pasted.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
function generateCode() {
  let code = "";
  for (let i = 0; i < 8; i++) {
    code += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return code;
}

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const codes = Array.from({ length: count }, () => ({
  code: generateCode(),
  max_uses: maxUses,
  note,
}));

const { error } = await supabase.from("invite_codes").insert(codes);
if (error) {
  console.error("Failed to create invite codes:", error.message);
  process.exit(1);
}

console.log(`Created ${count} invite code(s), ${maxUses} use(s) each:\n`);
codes.forEach((c) => console.log(c.code));
