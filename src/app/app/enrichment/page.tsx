import { notFound, redirect } from "next/navigation";
import { ApplicationShell } from "@/components/layout/application-shell";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { AuthCard } from "@/features/auth/components/auth-card";
import { SignOutButton } from "@/features/auth/components/sign-out-button";
import { getEnrichmentPageData } from "@/features/enrichment/queries.server";
import { EnrichmentReviewPanel } from "@/features/enrichment/components/enrichment-review";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "Review metadata | GemuKore",
  referrer: "same-origin",
  robots: { index: false, follow: false },
};
export default async function EnrichmentPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const result = await getEnrichmentPageData(await searchParams);
  if (result.status !== "authorized") {
    if (result.status === "UNAUTHENTICATED") redirect("/login");
    if (result.status === "DENIED" || result.status === "FORBIDDEN")
      redirect("/access-denied");
    if (result.status === "NOT_FOUND") notFound();
    return (
      <AuthCard
        title="Metadata review unavailable"
        description="We couldn't load this review. Your catalog and copy draft have not been changed. Try again later or continue adding your copy manually."
      >
        <SignOutButton />
      </AuthCard>
    );
  }
  return (
    <ApplicationShell
      context="Your collection"
      items={[
        { label: "Your collection", href: "/app", icon: "overview" },
        { label: "Browse collection", href: "/app/collection", icon: "cards" },
        { label: "Add game", href: "/app/games/new", icon: "forms" },
        { label: "Add accessory", href: "/app/accessories/new", icon: "forms" },
      ]}
    >
      <PageContainer>
        <PageHeader
          title="Review metadata"
          description="Find supported facts, compare suggestions, and choose what belongs in the shared catalog."
        />
        <EnrichmentReviewPanel
          key={
            result.review?.id ??
            `${result.target.target.kind}:${result.target.target.id}`
          }
          initialTarget={result.target}
          initialReview={result.review}
        />
      </PageContainer>
    </ApplicationShell>
  );
}
