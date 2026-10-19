import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { ApplicationShell } from "@/components/layout/application-shell";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { AuthCard } from "@/features/auth/components/auth-card";
import { SignOutButton } from "@/features/auth/components/sign-out-button";
import { getPlaytimePageData } from "@/features/games/playtime-queries.server";
import { PlaytimeEditor } from "@/features/games/components/playtime-editor";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "Catalog playtime | GemuKore",
  referrer: "same-origin",
};
export default async function PlaytimePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const result = await getPlaytimePageData({ kind: query.kind, id: query.id });
  if (result.status !== "authorized") {
    if (result.status === "UNAUTHENTICATED") redirect("/login");
    if (result.status === "DENIED" || result.status === "FORBIDDEN")
      redirect("/access-denied");
    if (result.status === "NOT_FOUND") notFound();
    return (
      <AuthCard
        title="Playtime unavailable"
        description="We couldn't load these playtime estimates. Please try again."
      >
        <SignOutButton />
      </AuthCard>
    );
  }
  return (
    <ApplicationShell
      context="Catalog administration"
      items={[
        { label: "Your collection", href: "/app", icon: "overview" },
        {
          label: "Game catalog",
          href: "/app/catalog/games",
          icon: "forms",
          current: true,
        },
      ]}
    >
      <PageContainer>
        <PageHeader
          title="Catalog playtime"
          description={result.record.label}
        />
        <Button asChild variant="outline">
          <Link
            href={`/app/catalog/games?kind=${result.record.kind}&id=${result.record.id}`}
          >
            Back to game catalog
          </Link>
        </Button>
        <PlaytimeEditor
          key={`${result.record.kind}-${result.record.id}`}
          record={result.record}
        />
      </PageContainer>
    </ApplicationShell>
  );
}
