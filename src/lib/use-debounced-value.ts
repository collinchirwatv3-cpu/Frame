import { useEffect, useState } from "react";

/** Delays reflecting `value` until it's stopped changing for `delayMs` —
 * used by TagTypeahead so a search-as-you-type field doesn't fire a query
 * on every keystroke. */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(t);
  }, [value, delayMs]);

  return debounced;
}
