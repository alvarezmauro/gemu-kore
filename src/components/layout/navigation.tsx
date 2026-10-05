import Link from "next/link";
import {
  LayoutGrid,
  Layers,
  TextCursorInput,
  Inbox,
  MapPin,
  Wrench,
} from "lucide-react";
import { cn } from "@/lib/utils";

const icons = {
  overview: LayoutGrid,
  cards: Layers,
  forms: TextCursorInput,
  feedback: Inbox,
  locations: MapPin,
  defects: Wrench,
};

export type NavigationItem = {
  label: string;
  href: string;
  icon: keyof typeof icons;
  current?: boolean;
};

export function Navigation({
  items,
  onNavigate,
}: {
  items: readonly NavigationItem[];
  onNavigate?: () => void;
}) {
  return (
    <nav aria-label="Main navigation" className="space-y-1">
      {items.map(({ label, href, icon, current }) => {
        const Icon = icons[icon];
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            aria-current={current ? "page" : undefined}
            className={cn(
              "flex min-h-11 items-center gap-3 rounded-lg px-3 py-3 text-[15px] leading-5 hover:bg-sidebar-accent motion-reduce:transition-none",
              current && "bg-sidebar-accent font-semibold",
            )}
          >
            <Icon className="size-5 shrink-0" aria-hidden="true" />
            <span className="min-w-0 break-words">{label}</span>
            {current && (
              <span
                className="ml-auto size-1.5 shrink-0 rounded-full bg-foreground"
                aria-hidden="true"
              />
            )}
          </Link>
        );
      })}
    </nav>
  );
}
