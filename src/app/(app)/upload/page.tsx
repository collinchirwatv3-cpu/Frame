import { UploadDropzone } from "@/components/upload/UploadDropzone";
import { SearchButton } from "@/components/ui/SearchButton";

export default function UploadPage() {
  return (
    <div className="relative pb-24 md:pb-8">
      {/* Fixed at the page level, not inside UploadDropzone — stays put
          across its internal idle/uploading/processing/published states
          instead of disappearing whenever that view changes. */}
      <SearchButton className="fixed top-4 right-4 md:top-6 md:right-6 z-20 bg-card border border-border" />
      <UploadDropzone />
    </div>
  );
}
