#!/usr/bin/env bash
# Verifies BOTH migration paths the DM migrations need to work under,
# against a real local Postgres via the Supabase CLI (not mocked):
#
#   1. A fresh chain — every migration in supabase/migrations/, including
#      20260917050000_dm_fixes_5.sql, applies cleanly to an empty database.
#   2. Upgrading an existing populated schema — data seeded on a database
#      stopped at 20260917020000_dm_fixes_2.sql (genuinely legacy-shaped:
#      last_message_id and friends don't exist yet, not just nulled out
#      afterwards) survives 20260917030000_dm_fixes_3.sql through
#      20260917050000_dm_fixes_5.sql being applied on top without a reset,
#      and 20260917050000's backfill correctly reconstructs read/unread/
#      empty/blocked/tied-timestamp positions from it.
#
# Requires Docker running and the Supabase CLI (`npx supabase`). Destroys
# and recreates the LOCAL Supabase instance this project's `supabase/`
# directory manages — never touches the real project. Safe to re-run.
set -euo pipefail
cd "$(dirname "$0")/.."

HOLDBACK_DIR=$(mktemp -d)
trap 'mv "$HOLDBACK_DIR"/*.sql supabase/migrations/ 2>/dev/null || true; rmdir "$HOLDBACK_DIR" 2>/dev/null || true' EXIT

echo "=== [1/4] Fresh migration chain (all migrations on an empty database) ==="
npx supabase db reset

echo
echo "=== [2/4] Rolling back to just after 20260917020000_dm_fixes_2.sql ==="
mv supabase/migrations/20260917030000_dm_fixes_3.sql "$HOLDBACK_DIR/"
mv supabase/migrations/20260917040000_dm_fixes_4.sql "$HOLDBACK_DIR/"
mv supabase/migrations/20260917050000_dm_fixes_5.sql "$HOLDBACK_DIR/"
npx supabase db reset

echo
echo "=== [3/4] Seeding legacy-shaped data (read/unread/empty/blocked/tied) ==="
SEED_RESULT=$(node scripts/dm-legacy-migration-seed.mjs | tail -1)
echo "$SEED_RESULT"

echo
echo "=== Restoring and applying 20260917030000 through 20260917050000 on top, without a reset ==="
mv "$HOLDBACK_DIR"/20260917030000_dm_fixes_3.sql supabase/migrations/
mv "$HOLDBACK_DIR"/20260917040000_dm_fixes_4.sql supabase/migrations/
mv "$HOLDBACK_DIR"/20260917050000_dm_fixes_5.sql supabase/migrations/
npx supabase migration up

echo
echo "=== [4/4] Verifying the backfill against that upgraded, previously-populated schema ==="
SEED_RESULT="$SEED_RESULT" node scripts/dm-legacy-migration-verify.mjs
