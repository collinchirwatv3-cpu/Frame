import { cn } from "@/lib/utils";

/** A real toggle switch — role="switch" + aria-checked, not a plain button
 * with "On"/"Off" text next to it. Native <button> keyboard behavior
 * (Enter/Space activates onClick) already satisfies the expected keyboard
 * interaction; nothing extra to wire up for that. `label` sets the
 * accessible name directly (aria-label) rather than relying on a wrapping
 * <label> element, which doesn't reliably associate with a button across
 * browsers/assistive tech the way it does with a real form control. */
export function Switch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "w-10 h-6 rounded-full relative transition-colors shrink-0 disabled:opacity-50",
        checked ? "bg-primary" : "bg-border"
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 w-5 h-5 rounded-full bg-bg transition-transform",
          checked ? "translate-x-[18px]" : "translate-x-0.5"
        )}
      />
    </button>
  );
}
