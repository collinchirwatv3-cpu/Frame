import { createClient } from "@/lib/supabase/client";
import type { Tag, TagCategory } from "@/lib/types";

type TagRow = {
  id: string;
  category_id: string;
  parent_tag_id: string | null;
  name: string;
  slug: string;
  manufacturer: string | null;
  product_model: string | null;
};

type TagCategoryRow = {
  id: string;
  section_number: number;
  name: string;
  tier: TagCategory["tier"];
  facet: TagCategory["facet"];
};

const TAG_SELECT = "id, category_id, parent_tag_id, name, slug, manufacturer, product_model";

function toTag(row: TagRow): Tag {
  return {
    id: row.id,
    categoryId: row.category_id,
    parentTagId: row.parent_tag_id ?? undefined,
    name: row.name,
    slug: row.slug,
    manufacturer: row.manufacturer ?? undefined,
    productModel: row.product_model ?? undefined,
  };
}

function toTagCategory(row: TagCategoryRow): TagCategory {
  return { id: row.id, sectionNumber: row.section_number, name: row.name, tier: row.tier, facet: row.facet };
}

/** All ~54 taxonomy sections — fetched once per upload-page mount, small
 * and static enough not to need pagination. */
export async function fetchTagCategories(): Promise<TagCategory[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("tag_categories")
    .select("id, section_number, name, tier, facet")
    .order("section_number");
  if (error || !data) return [];
  return (data as unknown as TagCategoryRow[]).map(toTagCategory);
}

/** Search-as-you-type against real tag data — the actual mechanism behind
 * "creators should never need to manually type a tag if it already
 * exists." Matches on name or manufacturer; v1 doesn't search
 * synonyms/search_keywords (array-substring matching isn't clean through
 * the PostgREST JS client) — a tsvector column is the right v2 for that,
 * not attempted here. */
export async function searchTags(query: string, categoryIds: string[], limit = 20): Promise<Tag[]> {
  const trimmed = query.trim();
  if (!trimmed || categoryIds.length === 0) return [];
  const supabase = createClient();
  const escaped = trimmed.replace(/[%_]/g, (c) => `\\${c}`);
  const { data, error } = await supabase
    .from("tags")
    .select(TAG_SELECT)
    .in("category_id", categoryIds)
    .eq("active", true)
    .or(`name.ilike.%${escaped}%,manufacturer.ilike.%${escaped}%`)
    .order("name")
    .limit(limit);
  if (error || !data) return [];
  return (data as unknown as TagRow[]).map(toTag);
}

/** Every top-level (no parent) tag in one category — content type has only
 * ~35 tags total, small enough for a plain select rather than a search
 * field, unlike gear's hundreds of models. */
export async function fetchTagsByCategory(categoryId: string, limit = 200): Promise<Tag[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("tags")
    .select(TAG_SELECT)
    .eq("category_id", categoryId)
    .is("parent_tag_id", null)
    .eq("active", true)
    .order("name")
    .limit(limit);
  if (error || !data) return [];
  return (data as unknown as TagRow[]).map(toTag);
}

/** Every tag directly under a manufacturer/parent tag — used by GearPicker
 * to browse a manufacturer's models without typing anything. */
export async function fetchChildTags(parentTagId: string): Promise<Tag[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("tags")
    .select(TAG_SELECT)
    .eq("parent_tag_id", parentTagId)
    .eq("active", true)
    .order("name");
  if (error || !data) return [];
  return (data as unknown as TagRow[]).map(toTag);
}

export async function fetchTagsByIds(ids: string[]): Promise<Tag[]> {
  if (ids.length === 0) return [];
  const supabase = createClient();
  const { data, error } = await supabase.from("tags").select(TAG_SELECT).in("id", ids);
  if (error || !data) return [];
  return (data as unknown as TagRow[]).map(toTag);
}

/** A location tag's breadcrumb (City -> Region -> Country -> Continent),
 * via the tag_ancestors() RPC — recursive walks aren't expressible through
 * the JS client directly. */
export async function fetchTagAncestors(tagId: string): Promise<Tag[]> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("tag_ancestors", { p_tag_id: tagId });
  if (error || !data) return [];
  return (data as unknown as TagRow[]).map(toTag);
}

/** What a set of selected gear tags would auto-inherit (tag_implies) — used
 * by GearPicker for client-side "also tags: Sony, Cinema Camera…" creator
 * transparency only. The server (api/uploads route) resolves this
 * authoritatively regardless of what the client shows. */
export async function fetchTagImplications(tagIds: string[]): Promise<Tag[]> {
  if (tagIds.length === 0) return [];
  const supabase = createClient();
  const { data, error } = await supabase
    .from("tag_implies")
    .select("implied:implied_tag_id(id, category_id, parent_tag_id, name, slug, manufacturer, product_model)")
    .in("tag_id", tagIds);
  if (error || !data) return [];
  const rows = data as unknown as { implied: TagRow | null }[];
  const seen = new Map<string, Tag>();
  for (const row of rows) {
    if (row.implied) seen.set(row.implied.id, toTag(row.implied));
  }
  return [...seen.values()];
}

type VideoTagRow = {
  source: "creator" | "inherited";
  tags: (TagRow & { tag_categories: { tier: TagCategory["tier"] } | null }) | null;
};

/** A video's tags grouped into the primary/secondary/technical display
 * tiers from the spec. Technical is filtered to source='creator' only —
 * showing every inherited manufacturer/mount/class tag there too would
 * make the "Shot on:" line noisy; filtering (elsewhere) uses the full set
 * regardless of source. A separate on-demand call, not folded into
 * video-fetch.ts's shared feed-list SELECT — only the detail view needs
 * full tag data. */
export async function fetchVideoTags(
  videoId: string
): Promise<{ primary: Tag[]; secondary: Tag[]; technical: Tag[] }> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("video_tags")
    .select(`source, tags!inner(${TAG_SELECT}, tag_categories!inner(tier))`)
    .eq("video_id", videoId);
  if (error || !data) return { primary: [], secondary: [], technical: [] };

  const rows = data as unknown as VideoTagRow[];
  const result: { primary: Tag[]; secondary: Tag[]; technical: Tag[] } = {
    primary: [],
    secondary: [],
    technical: [],
  };
  for (const row of rows) {
    if (!row.tags?.tag_categories) continue;
    if (row.tags.tag_categories.tier === "technical" && row.source !== "creator") continue;
    result[row.tags.tag_categories.tier].push(toTag(row.tags));
  }
  return result;
}
