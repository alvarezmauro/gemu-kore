import { PaletteTrigger } from "@/features/search/components/command-palette";
import { notFound, redirect } from "next/navigation";
import { ApplicationShell } from "@/components/layout/application-shell";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { CopySelector } from "@/features/collection/components/copy-selector";
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
  searchParams: Promise<{
    itemId?: string | string[];
    copyPage?: string | string[];
  }>;
}) {
  const params = await searchParams;
  const result = await getMediaPageData(params.itemId, params.copyPage);
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
            <CopySelector
              key={result.selected.id}
              action="/app/media"
              id="media-copy"
              initial={{
                items: result.items,
                page: result.copyPage,
                hasMore: result.hasMoreCopies,
              }}
              selected={result.selected}
            />
            <MediaManager
              key={result.selected.id}
              item={result.selected}
              photos={result.photos}
              canManage={result.canManage}
            />
          </>
        ) : (
          <EmptyState
            headingLevel={2}
            title="No collection items yet"
            description="Photos belong to physical copies. Once a copy is in your collection, you can add its photos here."
          />
        )}
        <SignOutButton />
      </PageContainer>
    </ApplicationShell>
  );
}
