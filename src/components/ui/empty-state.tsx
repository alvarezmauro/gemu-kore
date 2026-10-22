import type { ReactNode } from "react";
import { Inbox } from "lucide-react";

export function EmptyState({
  title,
  description,
  action,
  headingLevel = 3,
}: {
  title: string;
  description: string;
  action?: ReactNode;
  headingLevel?: 2 | 3;
}) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  return (
    <div className="flex flex-col items-center rounded-xl bg-card px-6 py-12 text-center">
      <div className="mb-4 rounded-xl bg-muted p-4">
        <Inbox className="size-6" aria-hidden="true" />
      </div>
      <Heading className="text-xl leading-7">{title}</Heading>
      <p className="mt-2 max-w-sm text-body">{description}</p>
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
