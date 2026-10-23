import { PaletteTrigger } from "@/features/search/components/command-palette";
import { notFound, redirect } from "next/navigation";
import { ApplicationShell } from "@/components/layout/application-shell";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { CopySelector } from "@/features/collection/components/copy-selector";
import { EmptyState } from "@/components/ui/empty-state";
import { AuthCard } from "@/features/auth/components/auth-card";
import { SignOutButton } from "@/features/auth/components/sign-out-button";
import { DefectManager } from "@/features/defects/components/defect-manager";
import { getDefectsPageData } from "@/features/defects/queries.server";

export const dynamic = "force-dynamic";
export const metadata = { title: "Defects | GemuKore" };
export default async function DefectsPage({
  searchParams,
}: {
  searchParams: Promise<{
    itemId?: string | string[];
    copyPage?: string | string[];
  }>;
}) {
  const params = await searchParams;
  const result = await getDefectsPageData(params.itemId, params.copyPage);
  if (result.status !== "authorized") {
    if (result.status === "UNAUTHENTICATED") redirect("/login");
    if (result.status === "DENIED") redirect("/access-denied");
    if (result.status === "NOT_FOUND") notFound();
    return (
      <AuthCard
        title="Defects unavailable"
        description="We couldn't load defects right now. Please try again in a moment."
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
        {
          label: "Defects",
          href: "/app/defects",
          icon: "defects",
          current: true,
        },
        { label: "Photos", href: "/app/media", icon: "photos" },
      ]}
    >
      <PageContainer>
        <PageHeader
          title="Defects"
          description="Keep a clear record of each physical copy's condition, including problems you've accepted or repaired."
        />
        {result.selected ? (
          <>
            <CopySelector
              key={result.selected.id}
              action="/app/defects"
              id="defect-copy"
              initial={{
                items: result.items,
                page: result.copyPage,
                hasMore: result.hasMoreCopies,
              }}
              selected={result.selected}
            />
            <DefectManager
              key={result.selected.id}
              item={result.selected}
              defects={result.defects}
              canManage={result.canManage}
            />
          </>
        ) : (
          <EmptyState
            headingLevel={2}
            title="No collection items yet"
            description="Defects belong to physical copies. Once a copy is in your collection, its condition can be recorded here."
          />
        )}
        <SignOutButton />
      </PageContainer>
    </ApplicationShell>
  );
}
