#!/usr/bin/env node
// Regenerates the `dm_supported_emoji` seed block inside
// supabase/migrations/20260917070000_dm_reaction_emoji_validation.sql from
// the SAME self-hosted emojibase-data file frimousse's picker reads
// (public/emoji-data/en/data.json) — the DB validator's catalogue is kept
// in exact lockstep with what the picker can actually produce, rather than
// hand-maintaining a second Unicode parser that can drift from it.
//
// Re-run this whenever public/emoji-data/en/data.json is updated (a newer
// emojibase-data release). It rewrites only the generated block between the
// BEGIN/END markers in the migration file — everything else (the function,
// grants, set_dm_reaction) is untouched. If that migration has already been
// applied anywhere real by the time you do this, write a NEW forward
// migration instead of re-running this against an applied one.
//
// Usage: node scripts/generate-emoji-catalogue.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const DATA_SOURCE = "public/emoji-data/en/data.json";
const REACTIONS_SOURCE = join(root, "src/lib/dm-reactions.ts");
const MIGRATION_PATH = join(root, "supabase/migrations/20260917070000_dm_reaction_emoji_validation.sql");
const CATALOGUE_VERSION = "emojibase-data@17.0.0"; // matches the version pinned when public/emoji-data was fetched

const data = JSON.parse(readFileSync(join(root, DATA_SOURCE), "utf8"));

const emojiSet = new Set();

// The 6 existing quick-reaction strings (DM_REACTIONS in dm-reactions.ts)
// predate this catalogue and are already live in stored dm_reactions rows
// and shipped client code — some (e.g. a bare "👍", U+1F44D with no
// trailing VS16) are a different exact byte sequence than emojibase-data's
// own canonical form for the same glyph (which includes VS16). Explicitly
// including them guarantees the quick-reaction row keeps validating
// without changing its strings (which would desync new reactions from
// already-stored rows using the old string, splitting one emoji into two
// separate-looking reaction groups) — the generated catalogue is still the
// single source of truth; this is just a fixed, tiny supplement to it, not
// a second parallel list to maintain.
const reactionsSrc = readFileSync(REACTIONS_SOURCE, "utf8");
const quickReactionMatches = [...reactionsSrc.matchAll(/emoji:\s*"([^"]+)"/g)];
if (quickReactionMatches.length === 0) {
  console.error(`No quick-reaction emoji found in ${REACTIONS_SOURCE} — DM_REACTIONS may have moved or been renamed.`);
  process.exit(1);
}
for (const [, emoji] of quickReactionMatches) emojiSet.add(emoji);

for (const entry of data) {
  if (entry.emoji) emojiSet.add(entry.emoji);
  for (const skin of entry.skins ?? []) {
    if (skin.emoji) emojiSet.add(skin.emoji);
  }
}
const emojis = [...emojiSet].sort();

function sqlLiteral(s) {
  return `'${s.replace(/'/g, "''")}'`;
}

// One VALUES row per line, 10 per statement-chunk for readability — this is
// generated, not hand-edited, so density isn't a concern beyond diffability.
const rows = emojis.map((e) => `  (${sqlLiteral(e)}, ${sqlLiteral(CATALOGUE_VERSION)})`);
const insertSql = `insert into dm_supported_emoji (emoji, source_version) values\n${rows.join(",\n")}\non conflict (emoji) do nothing;`;

const BEGIN = "-- BEGIN GENERATED CATALOGUE (scripts/generate-emoji-catalogue.mjs) --";
const END = "-- END GENERATED CATALOGUE --";

const migration = readFileSync(MIGRATION_PATH, "utf8");
const beginIdx = migration.indexOf(BEGIN);
const endIdx = migration.indexOf(END);
if (beginIdx === -1 || endIdx === -1) {
  console.error(`Could not find ${BEGIN} / ${END} markers in ${MIGRATION_PATH}`);
  process.exit(1);
}
const before = migration.slice(0, beginIdx + BEGIN.length);
const after = migration.slice(endIdx);
const updated = `${before}\n${insertSql}\n${after}`;
writeFileSync(MIGRATION_PATH, updated);

console.log(`Wrote ${emojis.length} emoji (source: ${DATA_SOURCE}, version: ${CATALOGUE_VERSION}) into ${MIGRATION_PATH}`);
