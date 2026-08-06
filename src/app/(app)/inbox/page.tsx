import { NotificationSummary } from "@/components/inbox/NotificationSummary";
import { DMThreadList } from "@/components/inbox/DMThreadList";
import { SearchButton } from "@/components/ui/SearchButton";
import { dmThreads } from "@/lib/mock-data";

export default function InboxPage() {
  return (
    <div className="pt-8 pb-24 md:pb-8 flex flex-col gap-6">
      <div className="flex items-center justify-between px-6">
        <h1 className="text-2xl font-bold">Inbox</h1>
        <SearchButton className="bg-card border border-border" />
      </div>
      <NotificationSummary />
      <DMThreadList threads={dmThreads} />
    </div>
  );
}
