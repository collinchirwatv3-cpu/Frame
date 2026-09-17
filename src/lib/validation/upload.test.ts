import { describe, expect, it } from "vitest";
import { uploadMetadataSchema, SHORTS_MAX_DURATION_SECONDS } from "./upload";

const CONTENT_TYPE_TAG_ID = "11111111-1111-4111-8111-111111111111";
const GENRE_TAG_ID = "22222222-2222-4222-8222-222222222222";
const TOPIC_TAG_ID = "33333333-3333-4333-8333-333333333333";

const validInput = {
  title: "Iceland, from 400ft",
  description: "Three weeks chasing storms.",
  contentTypeTagId: CONTENT_TYPE_TAG_ID,
  genreTagIds: [GENRE_TAG_ID],
  topicTagIds: [TOPIC_TAG_ID],
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

  it("rejects a malformed content-type tag id", () => {
    const result = uploadMetadataSchema.safeParse({ ...validInput, contentTypeTagId: "not-a-uuid" });
    expect(result.success).toBe(false);
  });

  it("rejects more than 3 genre tags", () => {
    const result = uploadMetadataSchema.safeParse({
      ...validInput,
      genreTagIds: [GENRE_TAG_ID, GENRE_TAG_ID, GENRE_TAG_ID, GENRE_TAG_ID],
    });
    expect(result.success).toBe(false);
  });

  it("rejects zero genre tags — at least one is required", () => {
    const result = uploadMetadataSchema.safeParse({ ...validInput, genreTagIds: [] });
    expect(result.success).toBe(false);
  });

  it("rejects more than 5 topic tags", () => {
    const result = uploadMetadataSchema.safeParse({
      ...validInput,
      topicTagIds: Array(6).fill(TOPIC_TAG_ID),
    });
    expect(result.success).toBe(false);
  });

  it("defaults mood/location/gear to empty/null — optional per the spec", () => {
    const result = uploadMetadataSchema.safeParse(validInput);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.moodTagIds).toEqual([]);
      expect(result.data.locationTagId).toBeNull();
      expect(result.data.gearTagIds).toEqual([]);
    }
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

  describe("trim bounds", () => {
    it("defaults trimStartSeconds to 0 and leaves trimEndSeconds undefined — untrimmed", () => {
      const result = uploadMetadataSchema.safeParse(validInput);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.trimStartSeconds).toBe(0);
        expect(result.data.trimEndSeconds).toBeUndefined();
      }
    });

    it("accepts a real trim window inside the video's duration", () => {
      const result = uploadMetadataSchema.safeParse({ ...validInput, trimStartSeconds: 2, trimEndSeconds: 30 });
      expect(result.success).toBe(true);
    });

    it("rejects a trim end at or before trim start", () => {
      const result = uploadMetadataSchema.safeParse({ ...validInput, trimStartSeconds: 10, trimEndSeconds: 10 });
      expect(result.success).toBe(false);
    });

    it("rejects a trim end past the video's duration", () => {
      const result = uploadMetadataSchema.safeParse({ ...validInput, trimEndSeconds: validInput.durationSeconds + 5 });
      expect(result.success).toBe(false);
    });

    it("rejects a trim start at or past the video's duration", () => {
      const result = uploadMetadataSchema.safeParse({ ...validInput, trimStartSeconds: validInput.durationSeconds });
      expect(result.success).toBe(false);
    });

    it("rejects a negative trim start", () => {
      const result = uploadMetadataSchema.safeParse({ ...validInput, trimStartSeconds: -1 });
      expect(result.success).toBe(false);
    });
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
        durationSeconds: SHORTS_MAX_DURATION_SECONDS + 0.1,
      });
      expect(longform.success).toBe(true);
    });

    it("rejects an unknown contentType", () => {
      const result = uploadMetadataSchema.safeParse({ ...validInput, contentType: "documentary" });
      expect(result.success).toBe(false);
    });

    it("rejects longform on a video under the 6-minute threshold", () => {
      const result = uploadMetadataSchema.safeParse({
        ...validInput,
        contentType: "longform",
        durationSeconds: SHORTS_MAX_DURATION_SECONDS - 1,
      });
      expect(result.success).toBe(false);
    });

    it("rejects longform at exactly six minutes", () => {
      const result = uploadMetadataSchema.safeParse({
        ...validInput,
        contentType: "longform",
        durationSeconds: SHORTS_MAX_DURATION_SECONDS,
      });
      expect(result.success).toBe(false);
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

  describe("publishMode", () => {
    it("defaults a missing publishMode to post", () => {
      const result = uploadMetadataSchema.safeParse(validInput);
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.publishMode).toBe("post");
    });

    it("accepts an explicit post or promote regardless of contentType", () => {
      for (const publishMode of ["post", "promote"] as const) {
        const result = uploadMetadataSchema.safeParse({ ...validInput, publishMode, contentType: "short" });
        expect(result.success).toBe(true);
      }
    });

    it("rejects an unknown publishMode", () => {
      const result = uploadMetadataSchema.safeParse({ ...validInput, publishMode: "sponsor" });
      expect(result.success).toBe(false);
    });

    it("rejects monetise on a short", () => {
      const result = uploadMetadataSchema.safeParse({
        ...validInput,
        publishMode: "monetise",
        contentType: "short",
      });
      expect(result.success).toBe(false);
    });

    it("accepts monetise on a film (long-form, not just explicit longform)", () => {
      const result = uploadMetadataSchema.safeParse({
        ...validInput,
        publishMode: "monetise",
        contentType: "film",
        durationSeconds: SHORTS_MAX_DURATION_SECONDS + 0.1,
      });
      expect(result.success).toBe(true);
    });

    it("accepts monetise on an explicit longform", () => {
      const result = uploadMetadataSchema.safeParse({
        ...validInput,
        publishMode: "monetise",
        contentType: "longform",
        durationSeconds: SHORTS_MAX_DURATION_SECONDS + 0.1,
      });
      expect(result.success).toBe(true);
    });
  });
});
