import { create } from "zustand";
import { persist } from "zustand/middleware";

type UploadDraftState = {
  title: string;
  description: string;
  contentTypeTagId: string | null;
  genreTagIds: string[];
  topicTagIds: string[];
  moodTagIds: string[];
  locationTagId: string | null;
  gearTagIds: string[];
  hasHydrated: boolean;
  setHasHydrated: (v: boolean) => void;
  setTitle: (title: string) => void;
  setDescription: (description: string) => void;
  setContentTypeTagId: (id: string | null) => void;
  setGenreTagIds: (ids: string[]) => void;
  setTopicTagIds: (ids: string[]) => void;
  setMoodTagIds: (ids: string[]) => void;
  setLocationTagId: (id: string | null) => void;
  setGearTagIds: (ids: string[]) => void;
  clearDraft: () => void;
};

const EMPTY_DRAFT = {
  title: "",
  description: "",
  contentTypeTagId: null,
  genreTagIds: [],
  topicTagIds: [],
  moodTagIds: [],
  locationTagId: null,
  gearTagIds: [],
};

/** Metadata-only draft persistence — a title/description/tag selection
 * survives a closed tab or a reload. The video File object itself cannot:
 * browsers can't serialize a Blob into localStorage, so the creator still
 * has to re-select the file. Real persistence of the file needs IndexedDB
 * or an actual upload-in-progress on a server, which is out of scope for
 * this pass.
 *
 * Persist key bumped to v2 (was "frame-upload-draft") since the shape
 * changed from a single `category` string to real tag-id arrays — an old
 * v1 draft just gets orphaned rather than migrated, cheap and safe pre-
 * launch with no existing store-migration precedent to match instead. */
export const useUploadDraftStore = create<UploadDraftState>()(
  persist(
    (set) => ({
      ...EMPTY_DRAFT,
      hasHydrated: false,
      setHasHydrated: (v) => set({ hasHydrated: v }),
      setTitle: (title) => set({ title }),
      setDescription: (description) => set({ description }),
      setContentTypeTagId: (contentTypeTagId) => set({ contentTypeTagId }),
      setGenreTagIds: (genreTagIds) => set({ genreTagIds }),
      setTopicTagIds: (topicTagIds) => set({ topicTagIds }),
      setMoodTagIds: (moodTagIds) => set({ moodTagIds }),
      setLocationTagId: (locationTagId) => set({ locationTagId }),
      setGearTagIds: (gearTagIds) => set({ gearTagIds }),
      clearDraft: () => set({ ...EMPTY_DRAFT }),
    }),
    {
      name: "frame-upload-draft-v2",
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    }
  )
);
