/** Shared look for every floating "glass" button in video chrome — Search,
 * profile avatar, the landscape nav rail's icons, Director Mode/mute
 * toggles, ActionRail's like/comment/share/save/more. Before this, each
 * component had its own near-identical-but-not-quite className (blur
 * present on some, missing a border/shadow on others), which read as
 * several unrelated components rather than one chrome system. Extract once,
 * apply everywhere, rather than keep hand-copying the same five utilities.
 * Callers still own size (`w-9 h-9` vs `w-11 h-11`) and any state-specific
 * classes (active color, hover background) — this only fixes the shared
 * "floating glass circle" foundation: shape, blur, border, shadow. */
export const CHROME_GLASS_CLASS =
  "rounded-full bg-card/70 backdrop-blur-md border border-white/10 shadow-[0_2px_10px_rgba(0,0,0,0.28)]";

/** Shared press-feedback value — every chrome button scales to this on tap,
 * whichever mechanism gets it there. Most (Search, profile, nav rail) use
 * the CSS class below directly on their one real element, since several of
 * them accept a caller-supplied `className` that needs to land on that same
 * element (a wrapping `motion.span` would silently break those overrides).
 * ActionRail's RailButton is the one exception — it already needs
 * framer-motion for its like-pulse keyframe animation, so it sets this same
 * scale via `whileTap` instead; the numeric export exists for that case. */
export const CHROME_TAP_SCALE = 0.8;
export const CHROME_TAP_SCALE_CLASS = "transition-transform duration-150 active:scale-[0.8]";
