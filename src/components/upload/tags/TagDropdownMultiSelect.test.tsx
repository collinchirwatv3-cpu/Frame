import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";

const OPTIONS = [
  { id: "t1", categoryId: "fiction_genre", name: "Short Film", slug: "short-film" },
  { id: "t2", categoryId: "fiction_genre", name: "Feature Film", slug: "feature-film" },
  { id: "t3", categoryId: "documentary_genre", name: "Documentary", slug: "documentary" },
];

vi.mock("@/lib/tags-fetch", () => ({
  fetchTagsByCategories: vi.fn(async () => OPTIONS),
  fetchTagsByIds: vi.fn(async (ids: string[]) => OPTIONS.filter((t) => ids.includes(t.id))),
}));

const { TagDropdownMultiSelect } = await import("./TagDropdownMultiSelect");

function setup(props: Partial<React.ComponentProps<typeof TagDropdownMultiSelect>> = {}) {
  const onChange = vi.fn();
  render(
    <TagDropdownMultiSelect label="Genre" categoryIds={["fiction_genre", "documentary_genre"]} max={2} value={[]} onChange={onChange} {...props} />
  );
  return { onChange };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("TagDropdownMultiSelect", () => {
  it("is closed by default, showing a placeholder", async () => {
    setup();
    expect(await screen.findByRole("button", { name: /Select genre/i })).toBeInTheDocument();
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("opens on click and lists every option immediately, no query required", async () => {
    setup();
    fireEvent.click(await screen.findByRole("button", { name: /Select genre/i }));
    expect(await screen.findByRole("option", { name: "Short Film" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Feature Film" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Documentary" })).toBeInTheDocument();
  });

  it("selecting an option calls onChange and reflects it on the closed trigger", async () => {
    const { onChange } = setup();
    fireEvent.click(await screen.findByRole("button", { name: /Select genre/i }));
    fireEvent.click(await screen.findByRole("option", { name: "Short Film" }));

    expect(onChange).toHaveBeenCalledWith(["t1"]);
    expect(screen.getByRole("option", { name: "Short Film" })).toHaveAttribute("aria-selected", "true");
  });

  it("clicking a selected option again deselects it", async () => {
    const { onChange } = setup({ value: ["t1"] });
    fireEvent.click(await screen.findByRole("button", { name: "Short Film" }));
    await screen.findByRole("option", { name: "Short Film" });

    fireEvent.click(screen.getByRole("option", { name: "Short Film" }));
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it("disables unselected options once max is reached", async () => {
    setup({ value: ["t1", "t2"], max: 2 });
    fireEvent.click(await screen.findByRole("button", { name: /Short Film, Feature Film/ }));
    const documentary = await screen.findByRole("option", { name: "Documentary" });
    expect(documentary).toBeDisabled();
  });

  it("filters the list as you type", async () => {
    setup();
    fireEvent.click(await screen.findByRole("button", { name: /Select genre/i }));
    await screen.findByRole("option", { name: "Documentary" });

    fireEvent.change(screen.getByPlaceholderText("Search genre…"), { target: { value: "film" } });

    expect(screen.getByRole("option", { name: "Short Film" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Feature Film" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Documentary" })).not.toBeInTheDocument();
  });

  it("closes on Escape", async () => {
    setup();
    fireEvent.click(await screen.findByRole("button", { name: /Select genre/i }));
    await screen.findByRole("listbox");

    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("listbox")).not.toBeInTheDocument());
  });

  it("closes when clicking outside", async () => {
    setup();
    fireEvent.click(await screen.findByRole("button", { name: /Select genre/i }));
    await screen.findByRole("listbox");

    fireEvent.pointerDown(document.body);
    await waitFor(() => expect(screen.queryByRole("listbox")).not.toBeInTheDocument());
  });
});
