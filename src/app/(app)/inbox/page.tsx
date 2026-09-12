import { NotificationSummary } from "@/components/inbox/NotificationSummary";
import { NotificationList } from "@/components/inbox/NotificationList";
import { DMThreadList } from "@/components/inbox/DMThreadList";

export default function InboxPage() {
  return (
    <div className="pt-8 pb-24 md:pb-8 flex flex-col gap-6">
      <div className="px-6">
        <h1 className="text-2xl font-bold">Inbox</h1>
      </div>
      <NotificationSummary />
      <NotificationList />
      <DMThreadList />
    </div>
  );
}
