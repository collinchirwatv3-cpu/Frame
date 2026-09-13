import { render, act, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useInView } from "./use-in-view";

// jsdom has no real IntersectionObserver — no existing test in this repo
// stubs one yet (SwipeFeed/ShortsFeed's own IntersectionObserver usage has
// no unit test coverage today), so this is a minimal, local fake rather
// than a shared convention to extend.
let lastCallback: IntersectionObserverCallback | null = null;
const observeSpy = vi.fn();
const disconnectSpy = vi.fn();

class FakeIntersectionObserver {
  constructor(callback: IntersectionObserverCallback) {
    lastCallback = callback;
  }
  observe = observeSpy;
  disconnect = disconnectSpy;
  unobserve = vi.fn();
}

function fireIntersection(isIntersecting: boolean) {
  lastCallback?.([{ isIntersecting } as IntersectionObserverEntry], null as unknown as IntersectionObserver);
}

// Renders the hook's own return value into the DOM rather than capturing it
// in an external variable — reassigning a module-scope variable during
// render is a purity violation this repo's lint config rejects, same
// family of rule as the ref/Date.now() cases elsewhere this session.
function Harness() {
  const { ref, inView } = useInView<HTMLDivElement>();
  return <div ref={ref} data-testid="target">{String(inView)}</div>;
}

beforeEach(() => {
  lastCallback = null;
  observeSpy.mockClear();
  disconnectSpy.mockClear();
  vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver);
});

describe("useInView", () => {
  it("starts false and observes the rendered element", () => {
    render(<Harness />);
    expect(screen.getByTestId("target").textContent).toBe("false");
    expect(observeSpy).toHaveBeenCalledTimes(1);
  });

  it("flips true once the observer reports intersection", () => {
    render(<Harness />);
    act(() => fireIntersection(true));
    expect(screen.getByTestId("target").textContent).toBe("true");
  });

  it("flips back to false once the observer reports it's left the viewport", () => {
    render(<Harness />);
    act(() => fireIntersection(true));
    expect(screen.getByTestId("target").textContent).toBe("true");
    act(() => fireIntersection(false));
    expect(screen.getByTestId("target").textContent).toBe("false");
  });

  it("disconnects the observer on unmount", () => {
    const { unmount } = render(<Harness />);
    unmount();
    expect(disconnectSpy).toHaveBeenCalledTimes(1);
  });
});
