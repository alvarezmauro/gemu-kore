import Image from "next/image";
import { ArrowDown, Gamepad2, Monitor, Disc3 } from "lucide-react";
import { ApplicationShell } from "@/components/layout/application-shell";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import type { NavigationItem } from "@/components/layout/navigation";
import { AnimationPreview } from "@/components/design-preview/animation-preview";
import { FormPreview } from "@/components/design-preview/form-preview";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingCards } from "@/components/ui/loading-cards";
import { ObjectCard } from "@/components/ui/object-card";

const navigation: readonly NavigationItem[] = [
  { label: "Overview", href: "#overview", icon: "overview", current: true },
  { label: "Cards", href: "#cards", icon: "cards" },
  { label: "Forms", href: "#forms", icon: "forms" },
  { label: "Feedback", href: "#feedback", icon: "feedback" },
];

export default function HomePage() {
  return (
    <ApplicationShell items={navigation} context="Design preview">
      <PageContainer>
        <section id="overview" className="space-y-6">
          <PageHeader
            title="GemuKore"
            description="A home for your gaming collection. This preview brings the shared layouts, cards and controls together."
            action={
              <Button asChild size="lg">
                <a href="#forms">
                  Try the form
                  <ArrowDown aria-hidden="true" />
                </a>
              </Button>
            }
          />
          <div className="grid items-center gap-6 rounded-xl bg-stone p-6 sm:p-8 xl:grid-cols-[1.3fr_1fr]">
            <div className="max-w-xl">
              <Badge variant="secondary">Design system · 2.2</Badge>
              <h2 className="mt-4 text-[28px] leading-9 tracking-[-0.035em] sm:text-4xl sm:leading-[44px]">
                A little room for your collection.
              </h2>
              <p className="mt-4 text-body">
                Warm surfaces, clear details and space for the things you love.
                A quiet frame for games, consoles and their stories.
              </p>
              <p className="mt-4 text-sm text-muted-foreground">
                Illustrative examples only. No collection records are loaded or
                saved here.
              </p>
            </div>
            <Image
              src="/brand/gemukore.png"
              width={1448}
              height={1086}
              sizes="(min-width: 1280px) 360px, (min-width: 768px) 480px, 80vw"
              alt="GemuKore logo with an illustrated orange gaming console and controller"
              className="mx-auto h-auto w-full max-w-[360px]"
              priority
            />
          </div>
        </section>
        <section id="cards" aria-labelledby="cards-title" className="space-y-6">
          <div>
            <h2 id="cards-title" className="text-2xl leading-8 tracking-tight">
              Cards, with room for the details
            </h2>
            <p className="mt-2 text-body">
              Catalog identity comes first. Details about an owned copy have
              their own space. Artwork areas use placeholders in this preview.
            </p>
          </div>
          <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
            <ObjectCard
              title="Chrono Trigger"
              identity="Game release · SNES · North America"
              media={
                <Disc3
                  className="size-16 text-muted-foreground"
                  aria-hidden="true"
                />
              }
              copyDetails={[
                { label: "Packaging", value: "Box present" },
                { label: "Notes", value: "Manual missing" },
              ]}
            />
            <ObjectCard
              title="Nintendo Entertainment System"
              identity="Console model · NES-001 · North America"
              media={
                <Monitor
                  className="size-16 text-muted-foreground"
                  aria-hidden="true"
                />
              }
              copyDetails={[
                { label: "Condition", value: "Light wear" },
                { label: "Notes", value: "Original controller" },
              ]}
            />
            <ObjectCard
              title="SNES controller"
              identity="Accessory variant · Standard · North America"
              media={
                <Gamepad2
                  className="size-16 text-muted-foreground"
                  aria-hidden="true"
                />
              }
              copyDetails={[
                { label: "Condition", value: "Clean shell" },
                { label: "Notes", value: "Cable tested" },
              ]}
            />
          </div>
        </section>
        <section id="forms" aria-labelledby="forms-title" className="space-y-6">
          <div>
            <h2 id="forms-title" className="text-2xl leading-8 tracking-tight">
              Simple, readable forms
            </h2>
            <p className="mt-2 text-body">
              Visible labels, helpful hints and feedback next to the field. Try
              submitting an empty name, then a sample name.
            </p>
          </div>
          <FormPreview />
          <div
            className="flex flex-wrap items-center gap-3"
            aria-label="Button examples"
          >
            <Button asChild variant="secondary">
              <a href="#cards">Browse card examples</a>
            </Button>
            <Button disabled>Unavailable action</Button>
          </div>
        </section>
        <section
          id="feedback"
          aria-labelledby="feedback-title"
          className="space-y-6"
        >
          <div>
            <h2
              id="feedback-title"
              className="text-2xl leading-8 tracking-tight"
            >
              A clear next step
            </h2>
            <p className="mt-2 text-body">
              Empty and loading examples keep the page structure familiar.
            </p>
          </div>
          <EmptyState
            title="Your collection starts with one item"
            description="Give your first game, console or accessory a place to call home."
            action={
              <Button asChild>
                <a href="#forms">Try the form example</a>
              </Button>
            }
          />
          <div className="space-y-4">
            <h3 className="text-lg leading-7">Loading example</h3>
            <LoadingCards label="Loading example cards" />
          </div>
        </section>
        <section
          id="motion"
          aria-labelledby="motion-title"
          className="space-y-6"
        >
          <div>
            <h2 id="motion-title" className="text-2xl leading-8 tracking-tight">
              Motion with a purpose
            </h2>
            <p className="mt-2 text-body">
              Try the entrance, list and detail examples. Your device’s
              reduced-motion preference keeps them static.
            </p>
          </div>
          <AnimationPreview />
        </section>
        <footer className="border-t py-6 text-sm text-muted-foreground">
          GemuKore design preview. Theme choices are saved on this device; form
          examples are not.
        </footer>
      </PageContainer>
    </ApplicationShell>
  );
}
