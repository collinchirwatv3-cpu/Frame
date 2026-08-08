import { describe, expect, it } from "vitest";
import { uploadMetadataSchema, LONGFORM_MIN_DURATION_SECONDS } from "./upload";

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

  describe("contentType", () => {
    it("defaults a missing contentType to film", () => {
      const result = uploadMetadataSchema.safeParse(validInput);
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.contentType).toBe("film");
    });

    it("accepts an explicit film, short, or longform (duration permitting)", () => {
      for (const contentType of ["film", "short"] as const) {
        const result = uploadMetadataSchema.safeParse({ ...validInput, contentType });
        expect(result.success).toBe(true);
      }
      const longform = uploadMetadataSchema.safeParse({
        ...validInput,
        contentType: "longform",
        durationSeconds: LONGFORM_MIN_DURATION_SECONDS,
      });
      expect(longform.success).toBe(true);
    });

    it("rejects an unknown contentType", () => {
      const result = uploadMetadataSchema.safeParse({ ...validInput, contentType: "documentary" });
      expect(result.success).toBe(false);
    });

    it("rejects longform on a video under the 3-minute threshold", () => {
      const result = uploadMetadataSchema.safeParse({
        ...validInput,
        contentType: "longform",
        durationSeconds: LONGFORM_MIN_DURATION_SECONDS - 1,
      });
      expect(result.success).toBe(false);
    });

    it("accepts longform right at the threshold, not just above it", () => {
      const result = uploadMetadataSchema.safeParse({
        ...validInput,
        contentType: "longform",
        durationSeconds: LONGFORM_MIN_DURATION_SECONDS,
      });
      expect(result.success).toBe(true);
    });

    it("does not reject film/short for a short duration — only longform has a duration floor", () => {
      const result = uploadMetadataSchema.safeParse({
        ...validInput,
        contentType: "film",
        durationSeconds: 10,
      });
      expect(result.success).toBe(true);
    });
  });
});
