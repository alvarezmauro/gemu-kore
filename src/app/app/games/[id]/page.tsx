import { redirect, notFound } from "next/navigation";
import { ApplicationShell } from "@/components/layout/application-shell";
import { PageContainer } from "@/components/layout/page-container";
import { AuthCard } from "@/features/auth/components/auth-card";
import { SignOutButton } from "@/features/auth/components/sign-out-button";
import { PaletteTrigger } from "@/features/search/components/command-palette";
import { getOwnedGamePageData } from "@/features/games/management-queries.server";
import { GameDetail } from "@/features/games/components/game-detail";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "Game copy | GemuKore",
  referrer: "same-origin",
};
export default async function GamePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const raw = query.screenshotsPage ?? "1";
  const screenshotsPage =
    typeof raw === "string" && /^[1-9]\d{0,3}$/.test(raw) ? Number(raw) : 0;
  const result = await getOwnedGamePageData({ id, screenshotsPage });
  if (result.status !== "authorized") {
    if (result.status === "UNAUTHENTICATED") redirect("/login");
    if (result.status === "DENIED") redirect("/access-denied");
    if (result.status === "NOT_FOUND") notFound();
    return (
      <AuthCard
        title="Game unavailable"
        description="We couldn't load this copy right now. Please try again."
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
        {
          label: "Browse collection",
          href: "/app/collection",
          icon: "cards",
          current: true,
        },
        ...(result.canManage
          ? [
              {
                label: "Add game",
                href: "/app/games/new",
                icon: "forms" as const,
              },
            ]
          : []),
        { label: "Locations", href: "/app/locations", icon: "locations" },
        { label: "Photos", href: "/app/media", icon: "photos" },
      ]}
    >
      <PageContainer>
        <GameDetail
          detail={result.detail}
          packaging={result.packaging}
          media={result.media}
          provenance={result.provenance}
          playtime={result.playtime}
          trailer={result.trailer}
          screenshots={result.screenshots}
          locations={result.locations}
          canManage={result.canManage}
        />
      </PageContainer>
    </ApplicationShell>
  );
}
