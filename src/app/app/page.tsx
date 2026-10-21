import { PaletteTrigger } from "@/features/search/components/command-palette";
import { redirect } from "next/navigation";
import { ApplicationShell } from "@/components/layout/application-shell";
import { PageContainer } from "@/components/layout/page-container";
import { DashboardUnavailable } from "@/features/dashboard/components/dashboard-unavailable";
import { SignOutButton } from "@/features/auth/components/sign-out-button";
import { getDashboardPageData } from "@/features/dashboard/queries.server";
import { Dashboard } from "@/features/dashboard/components/dashboard";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "Your collection | GemuKore",
  referrer: "same-origin",
};
export default async function PrivateEntryPage() {
  const result = await getDashboardPageData();
  if (result.status !== "authorized") {
    if (result.status === "UNAUTHENTICATED") redirect("/login");
    if (result.status === "DENIED") redirect("/access-denied");
    return <DashboardUnavailable />;
  }
  return (
    <ApplicationShell
      context="Your collection"
      headerActions={<PaletteTrigger compact />}
      items={[
        {
          label: "Your collection",
          href: "/app",
          icon: "overview",
          current: true,
        },
        { label: "Browse collection", href: "/app/collection", icon: "cards" },
        { label: "Search", href: "/app/search", icon: "search" },
        { label: "Locations", href: "/app/locations", icon: "locations" },
        { label: "Defects", href: "/app/defects", icon: "defects" },
        { label: "Photos", href: "/app/media", icon: "photos" },
      ]}
    >
      <PageContainer>
        <Dashboard data={result.data} />
        <SignOutButton />
      </PageContainer>
    </ApplicationShell>
  );
}
