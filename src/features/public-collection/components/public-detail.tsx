import Link from "next/link";
import { Disc3, Gamepad2, Monitor, Package } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { PublicDetail as Detail } from "../contracts";
import { PublicNavigation } from "./public-navigation";
import { PublicImage } from "./public-image";
import { PublicViewer } from "./public-viewer";
const category = {
  CONSOLE: "consoles",
  GAME: "games",
  ACCESSORY: "accessories",
} as const;
const label = { CONSOLE: "Console", GAME: "Game", ACCESSORY: "Accessory" };
const icons = { CONSOLE: Monitor, GAME: Disc3, ACCESSORY: Gamepad2 };
const words = (value: string) => value.toLowerCase().replaceAll("_", " ");
export function PublicDetail({ item }: { item: Detail }) {
  const Icon = icons[item.type],
    path = category[item.type];
  return (
    <div className="space-y-16 py-8 sm:py-12">
      <PublicNavigation current={path} />
      <nav
        aria-label="Breadcrumb"
        className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted-foreground"
      >
        <Link
          href="/collection"
          prefetch={false}
          className="inline-flex min-h-11 items-center underline"
        >
          The collection
        </Link>
        <span aria-hidden="true" className="py-3">
          /
        </span>
        <Link
          href={`/collection/${path}`}
          prefetch={false}
          className="inline-flex min-h-11 items-center underline"
        >
          {path[0].toUpperCase() + path.slice(1)}
        </Link>
        <span aria-hidden="true" className="py-3">
          /
        </span>
        <span className="py-3">{item.title}</span>
      </nav>
      <header className="grid min-w-0 items-center gap-8 lg:grid-cols-2 lg:gap-12">
        {item.photo ? (
          <PublicImage key={item.photo.url} image={item.photo} priority />
        ) : (
          <div className="flex aspect-[4/3] flex-col items-center justify-center gap-5 rounded-xl bg-stone p-8 text-muted-foreground">
            <Icon className="size-24" strokeWidth={1} aria-hidden="true" />
            <p>No public image available</p>
          </div>
        )}
        <div className="min-w-0 space-y-5">
          <p className="text-sm text-muted-foreground">
            From the collection · {label[item.type]}
          </p>
          <h1 className="font-heading text-4xl leading-tight tracking-tight sm:text-5xl">
            {item.title}
          </h1>
          <p className="text-lg leading-relaxed text-muted-foreground">
            {item.context}
          </p>
          <div className="flex flex-wrap gap-3">
            <Badge variant="secondary">
              {item.identificationStatus === "CONFIRMED"
                ? "Identification confirmed"
                : "Identification incomplete"}
            </Badge>
            <Badge variant="secondary">
              <Package aria-hidden="true" className="mr-1 size-4" />
              {item.hasBox === null
                ? "Box status unknown"
                : item.hasBox
                  ? "Box included"
                  : "Without box"}
            </Badge>
          </div>
          <p className="text-sm leading-relaxed text-muted-foreground">
            A physical copy from the collection. Catalog information describes
            its model, release or variant; it does not confirm the condition or
            completeness of this copy.
          </p>
        </div>
      </header>
      <section
        aria-labelledby="catalog-info"
        className="grid gap-8 md:grid-cols-[1fr_2fr]"
      >
        <div>
          <p className="mb-3 text-sm text-muted-foreground">
            The story behind the object
          </p>
          <h2 id="catalog-info" className="font-heading text-3xl">
            Catalog information
          </h2>
        </div>
        <div className="min-w-0 space-y-8">
          {item.description && (
            <p className="whitespace-pre-wrap text-lg leading-relaxed">
              {item.description}
            </p>
          )}
          <dl className="grid min-w-0 gap-x-8 gap-y-5 sm:grid-cols-2">
            {item.facts.map((f, i) => (
              <div key={i} className="min-w-0 border-t pt-3">
                <dt className="text-sm text-muted-foreground">{f.label}</dt>
                <dd className="mt-1 whitespace-pre-wrap">{f.value}</dd>
              </div>
            ))}
            {item.markets.length > 0 && (
              <div className="border-t pt-3">
                <dt className="text-sm text-muted-foreground">Markets</dt>
                <dd className="mt-1">{item.markets.join(", ")}</dd>
              </div>
            )}
          </dl>
          {!item.description && !item.facts.length && !item.markets.length && (
            <p>Catalog details have not been recorded.</p>
          )}
          {item.relatedTruncated && (
            <p className="text-sm text-muted-foreground">
              Some related catalog information is omitted.
            </p>
          )}
        </div>
      </section>
      {("serialNumber" in item ||
        "notes" in item ||
        "location" in item ||
        item.defects) && (
        <section
          aria-labelledby="copy-info"
          className="space-y-6 rounded-xl bg-card p-6 sm:p-8"
        >
          <h2 id="copy-info" className="font-heading text-3xl">
            This physical copy
          </h2>
          <dl className="grid min-w-0 gap-6 sm:grid-cols-2">
            {"serialNumber" in item && (
              <div>
                <dt className="text-sm text-muted-foreground">Serial number</dt>
                <dd>{item.serialNumber || "Not recorded"}</dd>
              </div>
            )}
            {"location" in item && (
              <div>
                <dt className="text-sm text-muted-foreground">Location</dt>
                <dd>
                  {item.location?.breadcrumb.join(" / ") || "Not recorded"}
                </dd>
              </div>
            )}
            {"notes" in item && (
              <div className="sm:col-span-2">
                <dt className="text-sm text-muted-foreground">
                  Collection notes
                </dt>
                <dd className="whitespace-pre-wrap">
                  {item.notes || "Not recorded"}
                </dd>
              </div>
            )}
          </dl>
          {item.defects && (
            <div className="space-y-4">
              <h3 className="font-heading text-xl">Recorded defects</h3>
              {item.defects.items.length === 0 ? (
                <p>No defects recorded. This is not a condition guarantee.</p>
              ) : (
                <ul className="space-y-4">
                  {item.defects.items.map((d, i) => (
                    <li key={i} className="border-t pt-4">
                      <h4 className="font-medium">{d.title}</h4>
                      <p className="text-sm text-muted-foreground">
                        {words(d.severity)} · {words(d.status)}
                      </p>
                      {d.description && (
                        <p className="mt-2 whitespace-pre-wrap">
                          {d.description}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {item.defects.hasMore && <p>More defects are recorded.</p>}
            </div>
          )}
        </section>
      )}
      {!!item.gallery?.images.length && (
        <section aria-labelledby="public-gallery" className="space-y-6">
          <h2 id="public-gallery" className="font-heading text-3xl">
            A closer look
          </h2>
          <div className="grid min-w-0 gap-6 sm:grid-cols-2">
            {item.gallery.images.map((image) => (
              <figure key={image.url} className="min-w-0 space-y-3">
                <PublicImage key={image.url} image={image} />
                <figcaption className="text-sm text-muted-foreground">
                  {image.source}
                  {image.caption && (
                    <span className="mt-1 block whitespace-pre-wrap text-foreground">
                      {image.caption}
                    </span>
                  )}
                </figcaption>
              </figure>
            ))}
          </div>
          {item.gallery.hasMore && (
            <p className="text-sm text-muted-foreground">
              More approved images are available.
            </p>
          )}
        </section>
      )}
      {item.model && (
        <PublicViewer
          key={`model:${item.id}`}
          itemId={item.id}
          title={item.title}
        />
      )}
      {!!item.components?.length && (
        <section aria-labelledby="expected-views" className="space-y-6">
          <h2 id="expected-views" className="font-heading text-3xl">
            Explore the physical edition
          </h2>
          <p className="text-muted-foreground">
            These catalog previews show expected components. They do not confirm
            what is present in this physical copy.
          </p>
          {item.components.map((c) => (
            <div key={c.id} className="space-y-3">
              <h3 className="font-heading text-xl">{c.name}</h3>
              <PublicViewer
                key={`${item.id}:${c.id}`}
                itemId={item.id}
                componentId={c.id}
                title={c.name}
              />
            </div>
          ))}
        </section>
      )}
      <Link
        href={`/collection/${path}`}
        prefetch={false}
        className="inline-flex min-h-11 items-center underline underline-offset-4"
      >
        Back to {path}
      </Link>
    </div>
  );
}
