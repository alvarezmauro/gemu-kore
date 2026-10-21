import type { ReactNode } from "react";
import Link from "next/link";
import { ThemeMenu } from "@/components/theme-menu";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "The collection | GemuKore",
  robots: { index: false, follow: false },
  referrer: "same-origin",
};

export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh [overflow-wrap:anywhere] [&_a]:whitespace-normal [&_button]:h-auto [&_button]:min-h-11 [&_button]:whitespace-normal">
      <a
        href="#main-content"
        className="sr-only fixed top-3 left-3 z-50 rounded-lg bg-background px-4 py-3 focus:not-sr-only"
      >
        Skip to content
      </a>
      <header className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 border-b px-6 py-5">
        <Link
          href="/collection"
          className="py-2 font-heading text-xl tracking-tight"
        >
          GemuKore
          <span className="ml-3 hidden text-sm font-normal text-muted-foreground sm:inline">
            The collection
          </span>
        </Link>
        <ThemeMenu />
      </header>
      <main
        id="main-content"
        tabIndex={-1}
        className="mx-auto max-w-6xl px-6 outline-none"
      >
        {children}
      </main>
      <footer className="mx-auto mt-20 flex max-w-6xl flex-wrap items-center justify-between gap-4 border-t px-6 py-8 text-sm text-muted-foreground">
        <p>GemuKore · A home for the games we keep.</p>
      </footer>
    </div>
  );
}
