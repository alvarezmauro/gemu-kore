import { redirect } from "next/navigation";
import { ApplicationShell } from "@/components/layout/application-shell";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { AuthCard } from "@/features/auth/components/auth-card";
import { SignOutButton } from "@/features/auth/components/sign-out-button";
import { PaletteTrigger } from "@/features/search/components/command-palette";
import { getGameCreationPageData } from "@/features/games/creation-queries.server";
import { GameWizard } from "@/features/games/components/game-wizard";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "Add game | GemuKore",
  referrer: "same-origin",
};
export default async function NewGamePage() {
  const result = await getGameCreationPageData();
  if (result.status !== "authorized") {
    if (result.status === "UNAUTHENTICATED") redirect("/login");
    if (result.status === "DENIED" || result.status === "FORBIDDEN")
      redirect("/access-denied");
    return (
      <AuthCard
        title="Game creation unavailable"
        description="We couldn't load this form right now. Please try again."
      >
        <SignOutButton />
      </AuthCard>
    );
  }
  return (
    <ApplicationShell
      context="Your collection"
      headerActions={<PaletteTrigger compact />}
      items={[
        { label: "Your collection", href: "/app", icon: "overview" },
        { label: "Browse collection", href: "/app/collection", icon: "cards" },
        {
          label: "Add game",
          href: "/app/games/new",
          icon: "forms",
          current: true,
        },
        { label: "Locations", href: "/app/locations", icon: "locations" },
        { label: "Photos", href: "/app/media", icon: "photos" },
      ]}
    >
      <PageContainer>
        <PageHeader
          title="Add a game"
          description="Choose a platform, title and release, record your copy’s details, then review before saving."
        />
        <GameWizard
          platforms={result.platforms}
          locations={result.locations}
          games={result.games}
          canManageCatalog={result.canManageCatalog}
        />
      </PageContainer>
    </ApplicationShell>
  );
}
