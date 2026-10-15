import { redirect } from "next/navigation";
import { ApplicationShell } from "@/components/layout/application-shell";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { AuthCard } from "@/features/auth/components/auth-card";
import { SignOutButton } from "@/features/auth/components/sign-out-button";
import { PaletteTrigger } from "@/features/search/components/command-palette";
import { getConsoleCreationPageData } from "@/features/consoles/queries.server";
import { ConsoleWizard } from "@/features/consoles/components/console-wizard";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "Add console | GemuKore",
  referrer: "same-origin",
};
export default async function NewConsolePage() {
  const result = await getConsoleCreationPageData();
  if (result.status !== "authorized") {
    if (result.status === "UNAUTHENTICATED") redirect("/login");
    if (result.status === "DENIED" || result.status === "FORBIDDEN")
      redirect("/access-denied");
    return (
      <AuthCard
        title="Console creation unavailable"
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
          label: "Add console",
          href: "/app/consoles/new",
          icon: "forms",
          current: true,
        },
        { label: "Locations", href: "/app/locations", icon: "locations" },
        { label: "Photos", href: "/app/media", icon: "photos" },
      ]}
    >
      <PageContainer>
        <PageHeader
          title="Add a console"
          description="Choose its catalog identity, record your copy's details, then review before saving."
        />
        <ConsoleWizard
          platforms={result.platforms}
          locations={result.locations}
        />
      </PageContainer>
    </ApplicationShell>
  );
}
