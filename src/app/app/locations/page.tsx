import { redirect } from "next/navigation";
import { ApplicationShell } from "@/components/layout/application-shell";
import { PageContainer } from "@/components/layout/page-container";
import { AuthCard } from "@/features/auth/components/auth-card";
import { SignOutButton } from "@/features/auth/components/sign-out-button";
import { LocationManager } from "@/features/locations/components/location-manager";
import { getLocationsPageData } from "@/features/locations/queries.server";

export const dynamic = "force-dynamic";
export const metadata = { title: "Locations | GemuKore" };

export default async function LocationsPage() {
  const result = await getLocationsPageData();
  if (result.status !== "authorized") {
    if (result.status === "UNAUTHENTICATED") redirect("/login");
    if (result.status === "DENIED") redirect("/access-denied");
    return (
      <AuthCard
        title="Locations unavailable"
        description="We couldn't load locations right now. Please try again in a moment."
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
        {
          label: "Locations",
          href: "/app/locations",
          icon: "locations",
          current: true,
        },
      ]}
    >
      <PageContainer>
        <LocationManager
          locations={result.locations}
          canManage={result.canManage}
        />
        <SignOutButton />
      </PageContainer>
    </ApplicationShell>
  );
}
