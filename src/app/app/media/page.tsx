import { PaletteTrigger } from "@/features/search/components/command-palette";
import { notFound, redirect } from "next/navigation";
import { ApplicationShell } from "@/components/layout/application-shell";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { AuthCard } from "@/features/auth/components/auth-card";
import { SignOutButton } from "@/features/auth/components/sign-out-button";
import { MediaManager } from "@/features/media/components/media-manager";
import { getMediaPageData } from "@/features/media/queries.server";

export const dynamic = "force-dynamic";
export const metadata = { title: "Photos | GemuKore" };
export default async function MediaPage({
  searchParams,
}: {
  searchParams: Promise<{ itemId?: string | string[] }>;
}) {
  const result = await getMediaPageData((await searchParams).itemId);
  if (result.status !== "authorized") {
    if (result.status === "UNAUTHENTICATED") redirect("/login");
    if (result.status === "DENIED") redirect("/access-denied");
    if (result.status === "NOT_FOUND") notFound();
    return (
      <AuthCard
        title="Photos unavailable"
        description="We couldn't load photos right now. Please try again in a moment."
      >
        <SignOutButton />
      </AuthCard>
    );
  }
  return (
    <ApplicationShell
      headerActions={<PaletteTrigger compact />}
      context="Your collection"
      items={[
        { label: "Your collection", href: "/app", icon: "overview" },
        { label: "Browse collection", href: "/app/collection", icon: "cards" },
        { label: "Search", href: "/app/search", icon: "search" },
        { label: "Locations", href: "/app/locations", icon: "locations" },
        { label: "Defects", href: "/app/defects", icon: "defects" },
        {
          label: "Photos",
          href: "/app/media",
          icon: "photos",
          current: true,
        },
      ]}
    >
      <PageContainer>
        <PageHeader
          title="Photos"
          description="Photograph each physical copy, its packaging and the details that make it yours."
        />
        {result.selected ? (
          <>
            <form
              action="/app/media"
              method="get"
              className="max-w-2xl space-y-2"
            >
              <Label htmlFor="media-copy">Collection copy</Label>
              <div className="flex min-w-0 flex-col gap-3 sm:flex-row">
                <select
                  className="min-h-12 w-full min-w-0 rounded-lg border border-input bg-background px-3 py-3 text-base focus-visible:outline-2 focus-visible:outline-ring"
                  id="media-copy"
                  name="itemId"
                  defaultValue={result.selected.id}
                >
                  {result.items.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}
                </select>
                <Button type="submit" variant="outline">
                  View copy
                </Button>
              </div>
            </form>
            <MediaManager
              key={result.selected.id}
              item={result.selected}
              photos={result.photos}
              canManage={result.canManage}
            />
          </>
        ) : (
          <EmptyState
            title="No collection items yet"
            description="Photos belong to physical copies. Once a copy is in your collection, you can add its photos here."
          />
        )}
        <SignOutButton />
      </PageContainer>
    </ApplicationShell>
  );
}
