import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";

const compositeThumbnailSpy = vi.fn(async (imageSrc: string, options: unknown) => {
  void imageSrc;
  void options;
  return new Blob(["fake"], { type: "image/jpeg" });
});
vi.mock("@/lib/thumbnail-canvas", () => ({
  compositeThumbnail: (imageSrc: string, options: unknown) => compositeThumbnailSpy(imageSrc, options),
}));

const { ThumbnailPicker } = await import("./ThumbnailPicker");

beforeEach(() => {
  vi.restoreAllMocks();
  compositeThumbnailSpy.mockClear();
});

function setup(overrides: Partial<React.ComponentProps<typeof ThumbnailPicker>> = {}) {
  const onDone = vi.fn();
  const onSkip = vi.fn();
  render(
    <ThumbnailPicker
      videoId="v1"
      durationSeconds={120}
      posterUrl="https://videodelivery.example/v1/thumbnail.jpg"
      onDone={onDone}
      onSkip={onSkip}
      {...overrides}
    />
  );
  return { onDone, onSkip };
}

describe("ThumbnailPicker", () => {
  it("has no way to upload an arbitrary image — only a real video frame", () => {
    setup();
    expect(screen.queryByText(/upload your own/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/choose an image/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /pick a frame/i })).not.toBeInTheDocument(); // no tab switcher either — it's the only mode
    expect(screen.getByLabelText("Scrub to a frame")).toBeInTheDocument();
  });

  it("confirms a plain frame pick via the JSON time-based endpoint, not an image upload", async () => {
    const fetchSpy = vi
      .spyOn(global, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ posterUrl: "https://cdn.example/frame.jpg" }), { status: 200 }));
    const { onDone } = setup();

    fireEvent.click(screen.getByRole("button", { name: /use this thumbnail/i }));
    await vi.waitFor(() => expect(onDone).toHaveBeenCalledWith("https://cdn.example/frame.jpg"));

    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/uploads/thumbnail",
      expect.objectContaining({ method: "POST", headers: { "Content-Type": "application/json" } })
    );
    expect(compositeThumbnailSpy).not.toHaveBeenCalled();
  });

  it("with a text overlay, composites the real frame (never an uploaded file) before submitting", async () => {
    const fetchSpy = vi
      .spyOn(global, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ posterUrl: "https://cdn.example/composited.jpg" }), { status: 200 }));
    const { onDone } = setup();

    fireEvent.click(screen.getByRole("button", { name: "Add text" }));
    fireEvent.change(screen.getByPlaceholderText("Title card text"), { target: { value: "Iceland Trip" } });
    fireEvent.click(screen.getByRole("button", { name: /use this thumbnail/i }));

    await vi.waitFor(() => expect(onDone).toHaveBeenCalledWith("https://cdn.example/composited.jpg"));
    expect(compositeThumbnailSpy).toHaveBeenCalledWith(
      expect.stringContaining("https://videodelivery.example/v1/thumbnail.jpg"),
      expect.objectContaining({ text: expect.objectContaining({ text: "Iceland Trip" }) })
    );
    const [, requestInit] = fetchSpy.mock.calls[0];
    expect((requestInit as RequestInit).body).toBeInstanceOf(FormData);
  });

  it("saves the latest selected timestamp even before the preview debounce finishes", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(new Response(JSON.stringify({ posterUrl: "https://cdn.example/frame.jpg" }), { status: 200 }));
    const { onDone } = setup();
    fireEvent.change(screen.getByRole("slider"), { target: { value: "12.34" } });
    fireEvent.click(screen.getByRole("button", { name: /use this thumbnail/i }));
    await vi.waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(JSON.parse(fetchSpy.mock.calls[0][1]!.body as string).timeSeconds).toBe(12.34);
  });

  it("preserves poster query parameters and previews the initial selected time", () => {
    setup({ posterUrl: "https://videodelivery.example/v1/thumbnail.jpg?token=example" });
    const image = document.querySelector("img")!;
    const url = new URL(image.src);
    expect(url.searchParams.get("token")).toBe("example");
    expect(url.searchParams.get("time")).toBe("60.00s");
    expect(screen.getByRole("slider")).toHaveAttribute("aria-valuetext", "1:00");
  });

  it("skip calls onSkip without touching the network", () => {
    const fetchSpy = vi.spyOn(global, "fetch");
    const { onSkip } = setup();
    fireEvent.click(screen.getByRole("button", { name: /skip for now/i }));
    expect(onSkip).toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
