import type { ReactNode } from "react";
import { ThemeMenu } from "@/components/theme-menu";
import { Navigation, type NavigationItem } from "./navigation";
import { MobileNavigation } from "./mobile-navigation";

export function ApplicationShell({
  children,
  items,
  context,
}: {
  children: ReactNode;
  items: readonly NavigationItem[];
  context: string;
}) {
  return (
    <>
      <a
        href="#main-content"
        className="sr-only fixed top-3 left-3 z-50 rounded-lg bg-background px-4 py-3 focus:not-sr-only"
      >
        Skip to content
      </a>
      <aside className="fixed inset-y-0 left-0 hidden w-62 flex-col gap-8 overflow-y-auto bg-sidebar p-6 text-sidebar-foreground lg:flex">
        <div>
          <p className="font-heading text-2xl font-medium tracking-tight">
            GemuKore
          </p>
          <p className="mt-1 text-sm text-muted-foreground">{context}</p>
        </div>
        <Navigation items={items} />
        <p className="mt-auto text-sm text-muted-foreground">
          A home for your collection.
        </p>
      </aside>
      <div className="min-w-0 lg:ml-62">
        <header className="sticky top-0 z-30 flex min-h-20 items-center justify-between gap-3 border-b bg-background px-4 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-2">
            <MobileNavigation items={items} context={context} />
            <p className="truncate text-sm font-medium lg:text-base">
              {context}
            </p>
          </div>
          <ThemeMenu />
        </header>
        <main id="main-content" tabIndex={-1} className="outline-none">
          {children}
        </main>
      </div>
    </>
  );
}
