import { redirect, notFound } from "next/navigation";
import { ApplicationShell } from "@/components/layout/application-shell";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { AuthCard } from "@/features/auth/components/auth-card";
import { SignOutButton } from "@/features/auth/components/sign-out-button";
import { PaletteTrigger } from "@/features/search/components/command-palette";
import { getOwnedConsolePageData } from "@/features/consoles/queries.server";
import { ConsoleDetail } from "@/features/consoles/components/console-detail";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "Console copy | GemuKore",
  referrer: "same-origin",
};
export default async function ConsolePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params,
    query = await searchParams;
  const raw = query.overridePage ?? "1";
  const overridePage =
    typeof raw === "string" && /^[1-9]\d{0,3}$/.test(raw) ? Number(raw) : 0;
  const result = await getOwnedConsolePageData({ id, overridePage });
  if (result.status !== "authorized") {
    if (result.status === "UNAUTHENTICATED") redirect("/login");
    if (result.status === "DENIED") redirect("/access-denied");
    if (result.status === "NOT_FOUND") notFound();
    return (
      <AuthCard
        title="Console unavailable"
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
                label: "Add console",
                href: "/app/consoles/new",
                icon: "forms" as const,
              },
            ]
          : []),
        { label: "Locations", href: "/app/locations", icon: "locations" },
        { label: "Photos", href: "/app/media", icon: "photos" },
      ]}
    >
      <PageContainer>
        <div className="[overflow-wrap:anywhere]">
          <PageHeader
            title={result.detail.platform.name}
            description={`${result.detail.model.name} · Copy ${id.slice(0, 8)}`}
          />
        </div>
        <ConsoleDetail
          detail={result.detail}
          locations={result.locations}
          canManage={result.canManage}
        />
      </PageContainer>
    </ApplicationShell>
  );
}
