import {
  ArrowDown,
  Disc3,
  Gamepad2,
  Monitor,
  Package,
  Library,
} from "lucide-react";
import { BlurFade } from "@/components/magic/blur-fade";
import { BentoCard, BentoGrid } from "@/components/magic/bento-grid";
import { NumberTicker } from "@/components/magic/number-ticker";
import { Button } from "@/components/ui/button";
import type { PublicHome as HomeData } from "../contracts";
import Link from "next/link";

const categories = [
  {
    key: "consoles",
    label: "Consoles",
    Icon: Monitor,
    description: "Where every adventure begins.",
  },
  {
    key: "games",
    label: "Games",
    Icon: Disc3,
    description: "Worlds worth keeping on the shelf.",
  },
  {
    key: "accessories",
    label: "Accessories",
    Icon: Gamepad2,
    description: "The things that bring play to life.",
  },
] as const;
const itemIcons = { CONSOLE: Monitor, GAME: Disc3, ACCESSORY: Gamepad2 };
const itemLabels = { CONSOLE: "Console", GAME: "Game", ACCESSORY: "Accessory" };

export function PublicHome({ data }: { data: HomeData }) {
  if (data.state === "private")
    return (
      <section className="mx-auto max-w-lg py-24 text-center sm:py-36">
        <Library
          aria-hidden="true"
          className="mx-auto mb-6 size-10 text-muted-foreground"
        />
        <h1 className="font-heading text-3xl leading-tight tracking-tight">
          {data.message}
        </h1>
      </section>
    );
  return (
    <>
      <BlurFade className="grid gap-10 py-16 sm:py-24 lg:grid-cols-[1fr_16rem] lg:items-end">
        <div>
          <p className="mb-6 text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">
            An archive of physical play
          </p>
          <h1 className="max-w-3xl font-heading text-4xl leading-[1.12] font-medium tracking-tight sm:text-6xl">
            {data.name}
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground">
            {data.description ||
              "Consoles, games and the little things in between. A personal collection of the objects that made us players."}
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild>
              <Link href="/collection/search" prefetch={false}>
                Explore all objects
              </Link>
            </Button>
            {data.recent.length > 0 && (
              <Button asChild variant="outline">
                <a href="#recent">
                  Step inside <ArrowDown aria-hidden="true" />
                </a>
              </Button>
            )}
          </div>
        </div>
        <div className="flex items-center gap-5 border-t pt-6 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-8">
          <Library
            aria-hidden="true"
            className="size-9 shrink-0 text-muted-foreground"
          />
          <div>
            <p className="font-heading text-4xl">
              <NumberTicker value={data.counts.total} />
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Objects on display
            </p>
          </div>
        </div>
      </BlurFade>
      <BentoGrid aria-label="On display" className="sm:grid-cols-3">
        {categories.map(({ key, label, Icon, description }) => (
          <BentoCard
            key={key}
            aria-label={label}
            className="flex flex-col justify-between border"
          >
            <div className="flex items-start justify-between gap-3">
              <Icon
                aria-hidden="true"
                className="size-7 text-muted-foreground"
              />
              <NumberTicker
                value={data.counts[key]}
                className="font-heading text-3xl"
              />
            </div>
            <div>
              <h2 className="font-heading text-xl">{label}</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {description}
              </p>
              <Link
                prefetch={false}
                href={`/collection/${key}`}
                className="mt-3 inline-flex min-h-11 items-center text-sm underline underline-offset-4"
              >
                Browse {label.toLowerCase()}
              </Link>
            </div>
          </BentoCard>
        ))}
      </BentoGrid>
      <section
        id="recent"
        aria-labelledby="recent-title"
        className="scroll-mt-8 py-16 sm:py-24"
      >
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="mb-3 text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">
              From the shelves
            </p>
            <h2
              id="recent-title"
              className="font-heading text-3xl tracking-tight sm:text-4xl"
            >
              Recently added
            </h2>
          </div>
          <p className="max-w-xs text-sm leading-relaxed text-muted-foreground">
            A closer look at the latest objects shared from the collection.
          </p>
        </div>
        {data.recent.length === 0 ? (
          <div className="rounded-xl border border-dashed px-6 py-14 text-center">
            <h3 className="font-heading text-2xl">The shelves are waiting</h3>
            <p className="mt-3 text-muted-foreground">
              There are no objects on display yet. Come back for a look around.
            </p>
          </div>
        ) : (
          <ol
            aria-label="Recently added objects"
            className="grid min-w-0 gap-5 sm:grid-cols-2 lg:grid-cols-3"
          >
            {data.recent.map((item, i) => {
              const Icon = itemIcons[item.type];
              return (
                <li
                  key={item.id}
                  className={`min-w-0 overflow-hidden rounded-xl border bg-card ${i === 0 ? "sm:col-span-2" : ""}`}
                >
                  <div
                    className="relative flex h-44 items-center justify-center border-b bg-muted/40 sm:h-52"
                    aria-hidden="true"
                  >
                    <span className="absolute top-4 left-5 font-mono text-xs text-muted-foreground">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <Icon
                      className="size-20 text-muted-foreground/60"
                      strokeWidth={1}
                    />
                    <span className="absolute right-5 bottom-4 text-xs text-muted-foreground">
                      No public photo
                    </span>
                  </div>
                  <div className="p-5 sm:p-6">
                    <p className="mb-3 text-xs font-medium tracking-wider text-muted-foreground uppercase">
                      {i === 0 ? "Latest addition · " : ""}
                      {itemLabels[item.type]}
                    </p>
                    <h3 className="font-heading text-xl leading-snug sm:text-2xl">
                      {item.title}
                    </h3>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                      {item.context}
                    </p>
                    <div className="mt-4 flex flex-wrap gap-3 text-xs text-muted-foreground">
                      {item.hasBox === true && (
                        <span className="flex items-center gap-1.5">
                          <Package className="size-3.5" aria-hidden="true" />
                          Box included
                        </span>
                      )}
                      {item.identificationStatus === "INCOMPLETE" && (
                        <span>Identification incomplete</span>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </>
  );
}
