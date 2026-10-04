import type { ReactNode } from "react";
import { Card, CardContent } from "./card";

export function ObjectCard({
  title,
  identity,
  media,
  copyDetails,
}: {
  title: string;
  identity: string;
  media: ReactNode;
  copyDetails?: readonly { label: string; value: string }[];
}) {
  return (
    <Card className="min-w-0 gap-0 pt-0 [overflow-wrap:anywhere]">
      <div className="flex aspect-[4/3] items-center justify-center bg-stone p-6">
        {media}
      </div>
      <CardContent className="space-y-4 pt-6">
        <div>
          <h3 className="text-lg leading-[26px]">{title}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{identity}</p>
        </div>
        {copyDetails && (
          <div className="border-t pt-4">
            <p className="mb-2 text-sm font-semibold">My copy</p>
            <dl className="space-y-2 text-sm">
              {copyDetails.map(({ label, value }) => (
                <div
                  key={label}
                  className="flex flex-wrap justify-between gap-x-4 gap-y-1"
                >
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className="min-w-0 max-w-full break-words text-right">
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
