import { describe, expect, it } from "vitest";
import { uploadMetadataSchema } from "./upload";

const validInput = {
  title: "Iceland, from 400ft",
  description: "Three weeks chasing storms.",
  category: "Travel",
  width: 1920,
  height: 1080,
  durationSeconds: 34,
  fileSizeBytes: 52_428_800,
};

describe("uploadMetadataSchema", () => {
  it("accepts valid input", () => {
    expect(uploadMetadataSchema.safeParse(validInput).success).toBe(true);
  });

  it("rejects an empty title", () => {
    const result = uploadMetadataSchema.safeParse({ ...validInput, title: "  " });
    expect(result.success).toBe(false);
  });

  it("rejects a title over 120 characters", () => {
    const result = uploadMetadataSchema.safeParse({ ...validInput, title: "a".repeat(121) });
    expect(result.success).toBe(false);
  });

  it("defaults a missing description to an empty string", () => {
    const { description, ...withoutDescription } = validInput;
    void description;
    const result = uploadMetadataSchema.safeParse(withoutDescription);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.description).toBe("");
  });

  it("rejects a category that isn't in the known list", () => {
    const result = uploadMetadataSchema.safeParse({ ...validInput, category: "Cooking" });
    expect(result.success).toBe(false);
  });

  it("rejects portrait dimensions even if everything else is valid", () => {
    const result = uploadMetadataSchema.safeParse({ ...validInput, width: 1080, height: 1920 });
    expect(result.success).toBe(false);
  });

  it("rejects non-positive dimensions", () => {
    const result = uploadMetadataSchema.safeParse({ ...validInput, width: 0, height: 1080 });
    expect(result.success).toBe(false);
  });

  it("rejects a non-positive duration", () => {
    const result = uploadMetadataSchema.safeParse({ ...validInput, durationSeconds: 0 });
    expect(result.success).toBe(false);
  });

  it("rejects a file size over the 20GB cap", () => {
    const result = uploadMetadataSchema.safeParse({
      ...validInput,
      fileSizeBytes: 21 * 1024 * 1024 * 1024,
    });
    expect(result.success).toBe(false);
  });
});
