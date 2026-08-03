import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Category } from "@/lib/types";

type UploadDraftState = {
  title: string;
  description: string;
  category: Category | null;
  hasHydrated: boolean;
  setHasHydrated: (v: boolean) => void;
  setTitle: (title: string) => void;
  setDescription: (description: string) => void;
  setCategory: (category: Category) => void;
  clearDraft: () => void;
};

/** Metadata-only draft persistence — a title/description survives a closed
 * tab or a reload. The video File object itself cannot: browsers can't
 * serialize a Blob into localStorage, so the creator still has to re-select
 * the file. Real persistence of the file needs IndexedDB or an actual
 * upload-in-progress on a server, which is out of scope for this pass. */
export const useUploadDraftStore = create<UploadDraftState>()(
  persist(
    (set) => ({
      title: "",
      description: "",
      category: null,
      hasHydrated: false,
      setHasHydrated: (v) => set({ hasHydrated: v }),
      setTitle: (title) => set({ title }),
      setDescription: (description) => set({ description }),
      setCategory: (category) => set({ category }),
      clearDraft: () => set({ title: "", description: "", category: null }),
    }),
    {
      name: "frame-upload-draft",
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    }
  )
);
