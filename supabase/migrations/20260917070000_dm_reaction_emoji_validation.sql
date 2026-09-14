-- Expands dm_reactions.emoji from the fixed 6-string CHECK constraint to
-- accepting any single, well-formed emoji sequence, backing the full emoji
-- picker (frimousse) added alongside the existing 6 quick reactions.
--
-- Policy — is_valid_reaction_emoji(text):
-- Postgres has no built-in Unicode grapheme-cluster segmentation (no ICU
-- boundary analysis available in plain SQL), so "exactly one emoji" is
-- defined here structurally instead, by walking the string one Unicode
-- CODE POINT at a time (safe in a UTF8 database: ascii(), length() and
-- substring() on `text` operate on characters, not bytes) and requiring
-- every code point to be one of:
--   - a Zero-Width Joiner (U+200D) — always allowed, joins two "base"
--     pictographs into one visual glyph (family/profession/couple emoji).
--   - a variation selector (U+FE0E/FE0F) — text/emoji presentation, always
--     allowed, attaches to the PRECEDING character only.
--   - a Fitzpatrick skin-tone modifier (U+1F3FB-1F3FF) — always allowed.
--   - a regional indicator (U+1F1E6-1F1FF) — allowed only in pairs with
--     nothing else in the string (flags are always exactly 2).
--   - a "base" pictograph, from a curated allowlist of the Unicode blocks
--     emoji are actually drawn from (U+1F000-1FFFF — the entire
--     supplementary-plane range covering Emoticons, Transport & Map,
--     Supplemental Symbols and Pictographs, Symbols and Pictographs
--     Extended-A, etc. — plus a short list of legacy BMP symbols like
--     heart/star/arrows that predate the emoji blocks but are still
--     emoji-rendered, e.g. U+2764 "❤" or U+2B50 "⭐"). Two base pictographs
--     are only legal back-to-back if the FIRST one's very next code point
--     is a ZWJ — anything else (including two bases with a stray
--     variation selector or skin tone between them but no ZWJ) is
--     rejected, which is what actually distinguishes one real emoji
--     sequence ("👨‍👩‍👧‍👦") from two unrelated ones concatenated ("😀😀").
--   - digits/#/* are allowed ONLY as the entire string in the fixed
--     keycap shape `[0-9#*] U+FE0F? U+20E3` (0️⃣-9️⃣, #️⃣, *️⃣) — never as bare
--     characters, so an ordinary number never validates as "an emoji".
-- A byte-length cap (64) and a code-point cap (16) bound the whole thing
-- regardless — generous for the longest real sequences (a two-person kiss
-- with two different skin tones is 10 code points / 35 UTF-8 bytes, since
-- every supplementary-plane character in it is 4 bytes) while flatly
-- rejecting arbitrary text or an oversized payload before the
-- character-by-character walk even starts. The byte cap is intentionally
-- well above the code-point cap's own worst case (16 code points × 4 bytes
-- = 64) rather than a tight guess — an under-sized byte cap is exactly the
-- "simplistic length rule that rejects legitimate joined emoji" this
-- function is supposed to avoid, and a real 10-code-point/35-byte sequence
-- tripping a too-tight 32-byte guess is what caught this during testing.
--
-- Newer/unsupported Unicode Emoji versions: this is a RANGE allowlist, not
-- a lookup against the canonical Unicode emoji-sequences.txt list, so it
-- can't distinguish "a real, currently-defined emoji" from "a syntactically
-- plausible but not-yet-assigned code point sequence in the same blocks" —
-- it fails OPEN within those ranges, not closed against them. New emoji
-- added by a future Unicode version overwhelmingly land as newly-assigned
-- code points WITHIN the ranges already allowed here (U+1F000-1FFFF has
-- been where new emoji blocks have landed for years), so most future
-- emoji work without any migration change. Only a genuinely new emoji
-- block landing OUTSIDE U+1F000-1FFFF and the short BMP symbol list above
-- needs a follow-up migration extending the ranges — a real (if currently
-- unpopulated) scenario, not a defect: this fails CLOSED for that case
-- (rejects the unrecognized code point) rather than accepting arbitrary
-- data, which is the safe direction for a security boundary to fail in.
create function is_valid_reaction_emoji(p_emoji text) returns boolean
language plpgsql immutable
as $$
declare
  v_len integer;
  v_i integer;
  v_code integer;
  v_prev_code integer;
  v_base_count integer := 0;
  v_ri_count integer := 0;
begin
  if p_emoji is null then
    return false;
  end if;
  if octet_length(p_emoji) = 0 or octet_length(p_emoji) > 64 then
    return false;
  end if;

  -- Keycap sequences are a fixed, fully self-contained shape, checked as a
  -- whole-string special case — a bare digit/#/* must never pass outside
  -- this exact pattern (it isn't a base pictograph in the loop below).
  -- Built via chr() rather than embedding the (invisible) variation
  -- selector and combining-keycap characters directly in the regex
  -- literal, so the pattern stays reviewable in plain text.
  if p_emoji ~ ('^[0-9#*](' || chr(65039) || ')?' || chr(8419) || '$') then
    return true;
  end if;

  v_len := length(p_emoji);
  if v_len = 0 or v_len > 16 then
    return false;
  end if;

  for v_i in 1..v_len loop
    v_code := ascii(substring(p_emoji from v_i for 1));

    if v_code = 8205 then
      -- Zero-Width Joiner — always allowed, joins the surrounding bases.
      null;
    elsif v_code = 65038 or v_code = 65039 then
      -- Variation selector-15/16 (text/emoji presentation).
      null;
    elsif v_code between 127995 and 127999 then
      -- Fitzpatrick skin-tone modifiers.
      null;
    elsif v_code between 127462 and 127487 then
      -- Regional indicators (flags) — counted, validated after the loop.
      v_ri_count := v_ri_count + 1;
    elsif
      v_code = 169 or v_code = 174                    -- (c) (r)
      or v_code = 8252 or v_code = 8265                -- ‼ ⁉
      or v_code = 8482 or v_code = 8505                -- tm, info
      or v_code between 8596 and 8601                  -- left-right arrows etc.
      or v_code between 8617 and 8618                  -- hook arrows
      or v_code between 8986 and 8987                  -- watch, hourglass
      or v_code = 9000 or v_code = 9167                -- keyboard, eject
      or v_code between 9193 and 9210                  -- media control symbols
      or v_code = 9410                                 -- circled M
      or v_code between 9642 and 9643                  -- small squares
      or v_code = 9654 or v_code = 9664                -- play/reverse triangles
      or v_code between 9723 and 9726                  -- squares
      or v_code between 9728 and 10175                 -- Misc Symbols + Dingbats (U+2600-27BF)
      or v_code between 10548 and 10549                -- curved arrows
      or v_code between 11013 and 11015                -- arrows
      or v_code between 11035 and 11036                -- black squares
      or v_code = 11088 or v_code = 11093               -- star, heavy circle
      or v_code = 12336 or v_code = 12349               -- wavy dash, part alternation
      or v_code = 12951 or v_code = 12953               -- circled ideographs
      or v_code between 126976 and 131071                -- U+1F000-1FFFF: the main emoji planes
    then
      -- A "base" pictograph. Two in a row are only legitimate when the
      -- immediately preceding code point was a ZWJ.
      if v_base_count > 0 and v_prev_code is distinct from 8205 then
        return false;
      end if;
      v_base_count := v_base_count + 1;
    else
      return false;
    end if;

    v_prev_code := v_code;
  end loop;

  if v_ri_count > 0 then
    return v_ri_count = 2 and v_base_count = 0;
  end if;

  return v_base_count >= 1;
end;
$$;
-- Callable only from server-side validation (set_dm_reaction below and the
-- CHECK constraint) — no reason for any client role to call it directly.
revoke all on function is_valid_reaction_emoji(text) from public, anon, authenticated;

alter table dm_reactions drop constraint if exists dm_reactions_emoji_check;
alter table dm_reactions
  add constraint dm_reactions_emoji_check check (emoji is null or is_valid_reaction_emoji(emoji));

create or replace function set_dm_reaction(p_message_id uuid, p_emoji text) returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_thread uuid;
  v_now timestamptz := clock_timestamp();
  v_count integer;
begin
  if v_me is null or not is_invited(v_me) then
    raise exception 'Messaging unavailable';
  end if;
  if p_emoji is not null and not is_valid_reaction_emoji(p_emoji) then
    raise exception 'Invalid reaction';
  end if;
  select t.id into v_thread from dm_messages m join dm_threads t on t.id = m.thread_id
  where m.id = p_message_id and v_me in (t.user_a_id, t.user_b_id)
    and not is_blocked_pair(t.user_a_id, t.user_b_id);
  if not found then raise exception 'Messaging unavailable'; end if;

  insert into dm_reaction_rate_state (user_id, window_start, count) values (v_me, v_now, 1)
  on conflict (user_id) do update
    set window_start = case when dm_reaction_rate_state.window_start <= v_now - interval '1 minute'
                           then v_now else dm_reaction_rate_state.window_start end,
        count = case when dm_reaction_rate_state.window_start <= v_now - interval '1 minute'
                     then 1 else dm_reaction_rate_state.count + 1 end
    where dm_reaction_rate_state.window_start <= v_now - interval '1 minute'
       or dm_reaction_rate_state.count < 60
  returning count into v_count;
  if not found then raise exception 'Too many reactions. Please slow down.'; end if;

  insert into dm_reactions (message_id, thread_id, user_id, emoji)
    values (p_message_id, v_thread, v_me, p_emoji)
  on conflict (message_id, user_id) do update set emoji = excluded.emoji
    where dm_reactions.emoji is distinct from excluded.emoji;
end;
$$;
revoke execute on function set_dm_reaction(uuid, text) from public, anon, authenticated;
grant execute on function set_dm_reaction(uuid, text) to authenticated;
