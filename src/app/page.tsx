import { ThemeMenu } from "@/components/theme-menu";

export default function HomePage() {
  return (
    <main className="flex min-h-svh items-center justify-center px-6 py-16">
      <div className="w-full max-w-xl">
        <div className="mb-6 flex items-center justify-between gap-4">
          <p className="text-sm font-semibold tracking-widest text-muted-foreground uppercase">
            Coming soon
          </p>
          <ThemeMenu />
        </div>
        <h1 className="text-5xl font-semibold tracking-tight sm:text-7xl">
          GemuKore
        </h1>
        <p className="mt-6 text-xl leading-relaxed text-muted-foreground">
          A home for your gaming collection.
        </p>
        <p className="mt-3 max-w-md leading-relaxed text-muted-foreground">
          Your games, consoles, and accessories. Their stories, all in one
          place.
        </p>
      </div>
    </main>
  );
}
