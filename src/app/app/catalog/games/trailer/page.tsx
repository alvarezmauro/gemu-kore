import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { ApplicationShell } from "@/components/layout/application-shell";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { AuthCard } from "@/features/auth/components/auth-card";
import { SignOutButton } from "@/features/auth/components/sign-out-button";
import { getTrailerPageData } from "@/features/games/trailer-queries.server";
import { TrailerEditor } from "@/features/games/components/trailer-editor";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "Catalog trailer | GemuKore",
  referrer: "same-origin",
};
export default async function TrailerPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const result = await getTrailerPageData({ kind: query.kind, id: query.id });
  if (result.status !== "authorized") {
    if (result.status === "UNAUTHENTICATED") redirect("/login");
    if (result.status === "DENIED" || result.status === "FORBIDDEN")
      redirect("/access-denied");
    if (result.status === "NOT_FOUND") notFound();
    return (
      <AuthCard
        title="Trailer unavailable"
        description="We couldn't load this catalog trailer. Please try again."
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
        <PageHeader title="Catalog trailer" description={result.record.label} />
        <Button asChild variant="outline">
          <Link
            href={`/app/catalog/games?kind=${result.record.kind}&id=${result.record.id}`}
          >
            Back to game catalog
          </Link>
        </Button>
        <TrailerEditor
          key={`${result.record.kind}-${result.record.id}`}
          record={result.record}
        />
      </PageContainer>
    </ApplicationShell>
  );
}
