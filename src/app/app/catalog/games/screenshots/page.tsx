import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { ApplicationShell } from "@/components/layout/application-shell";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { AuthCard } from "@/features/auth/components/auth-card";
import { SignOutButton } from "@/features/auth/components/sign-out-button";
import { getScreenshotsPageData } from "@/features/games/screenshot-queries.server";
import { ScreenshotManager } from "@/features/games/components/screenshot-manager";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "Release screenshots | GemuKore",
  referrer: "same-origin",
};
export default async function ScreenshotsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const raw = query.page ?? "1";
  const page =
    typeof raw === "string" && /^[1-9]\d{0,3}$/.test(raw) ? Number(raw) : 0;
  const result = await getScreenshotsPageData({
    releaseId: query.releaseId,
    page,
  });
  if (result.status !== "authorized") {
    if (result.status === "UNAUTHENTICATED") redirect("/login");
    if (result.status === "DENIED" || result.status === "FORBIDDEN")
      redirect("/access-denied");
    if (result.status === "NOT_FOUND") notFound();
    return (
      <AuthCard
        title="Screenshots unavailable"
        description="We couldn't load this release gallery. Please try again."
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
          title="Release screenshots"
          description={result.release.name}
        />
        <Button asChild variant="outline">
          <Link
            href={`/app/catalog/games?kind=release&id=${result.release.id}`}
          >
            Back to release catalog
          </Link>
        </Button>
        <ScreenshotManager release={result.release} gallery={result.gallery} />
      </PageContainer>
    </ApplicationShell>
  );
}
