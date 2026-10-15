import { PaletteTrigger } from "@/features/search/components/command-palette";
import { redirect } from "next/navigation";
import { ApplicationShell } from "@/components/layout/application-shell";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { AuthCard } from "@/features/auth/components/auth-card";
import { SignOutButton } from "@/features/auth/components/sign-out-button";
import { getSearchPageData } from "@/features/search/queries.server";
import { CollectionWorkspace } from "@/features/search/components/collection-workspace";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "Collection | GemuKore",
  referrer: "same-origin",
};
export default async function CollectionPage() {
  const result = await getSearchPageData();
  if (result.status !== "authorized") {
    if (result.status === "UNAUTHENTICATED") redirect("/login");
    if (result.status === "DENIED") redirect("/access-denied");
    return (
      <AuthCard
        title="Collection unavailable"
        description="We couldn't check your access right now. Please try again."
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
        {
          label: "Browse collection",
          href: "/app/collection",
          icon: "cards",
          current: true,
        },
        { label: "Search", href: "/app/search", icon: "search" },
        { label: "Locations", href: "/app/locations", icon: "locations" },
        { label: "Defects", href: "/app/defects", icon: "defects" },
        { label: "Photos", href: "/app/media", icon: "photos" },
      ]}
    >
      <PageContainer>
        <PageHeader
          title="Your collection"
          description="Browse your consoles, games and accessories. Each physical copy has its own place here."
        />
        <CollectionWorkspace options={result.options} collectionHome />
        <SignOutButton />
      </PageContainer>
    </ApplicationShell>
  );
}
