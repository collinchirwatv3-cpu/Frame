import { NotificationSummary } from "@/components/inbox/NotificationSummary";
import { DMThreadList } from "@/components/inbox/DMThreadList";
import { dmThreads } from "@/lib/mock-data";

export default function InboxPage() {
  return (
    <div className="pt-8 pb-24 md:pb-8 flex flex-col gap-6">
      <h1 className="text-2xl font-bold px-6">Inbox</h1>
      <NotificationSummary />
      <DMThreadList threads={dmThreads} />
    </div>
  );
}
