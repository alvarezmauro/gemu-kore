import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ApplicationShell } from "@/components/layout/application-shell";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { AuthCard } from "@/features/auth/components/auth-card";
import { SignOutButton } from "@/features/auth/components/sign-out-button";
import { getMediaPageData } from "@/features/physical-media/queries.server";
import { CartridgeManager } from "@/features/physical-editions/components/packaging-manager";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "Release cartridges | GemuKore",
  referrer: "same-origin",
};
export default async function PackagingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams,
    result = await getMediaPageData({ releaseId: params.releaseId });
  if (result.status !== "authorized") {
    if (result.status === "UNAUTHENTICATED") redirect("/login");
    if (result.status === "DENIED" || result.status === "FORBIDDEN")
      redirect("/access-denied");
    if (result.status === "NOT_FOUND") notFound();
    return (
      <AuthCard
        title="Cartridges unavailable"
        description="We couldn't load this release. Please try again."
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
          title="Release cartridges"
          description={result.data.release.name}
        />
        <Button asChild variant="outline">
          <Link
            href={`/app/catalog/games?kind=release&id=${result.data.release.id}`}
          >
            Back to release catalog
          </Link>
        </Button>
        <CartridgeManager data={result.data} />
      </PageContainer>
    </ApplicationShell>
  );
}
