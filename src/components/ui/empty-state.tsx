import type { ReactNode } from "react";
import { Inbox } from "lucide-react";

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center rounded-xl bg-card px-6 py-12 text-center">
      <div className="mb-4 rounded-xl bg-muted p-4">
        <Inbox className="size-6" aria-hidden="true" />
      </div>
      <h3 className="text-xl leading-7">{title}</h3>
      <p className="mt-2 max-w-sm text-body">{description}</p>
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
