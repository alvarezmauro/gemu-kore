import { notFound, redirect } from "next/navigation";
import { ApplicationShell } from "@/components/layout/application-shell";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { AuthCard } from "@/features/auth/components/auth-card";
import { SignOutButton } from "@/features/auth/components/sign-out-button";
import { DefectManager } from "@/features/defects/components/defect-manager";
import { getDefectsPageData } from "@/features/defects/queries.server";

export const dynamic = "force-dynamic";
export const metadata = { title: "Defects | GemuKore" };
export default async function DefectsPage({
  searchParams,
}: {
  searchParams: Promise<{ itemId?: string | string[] }>;
}) {
  const result = await getDefectsPageData((await searchParams).itemId);
  if (result.status !== "authorized") {
    if (result.status === "UNAUTHENTICATED") redirect("/login");
    if (result.status === "DENIED") redirect("/access-denied");
    if (result.status === "NOT_FOUND") notFound();
    return (
      <AuthCard
        title="Defects unavailable"
        description="We couldn't load defects right now. Please try again in a moment."
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
        { label: "Locations", href: "/app/locations", icon: "locations" },
        {
          label: "Defects",
          href: "/app/defects",
          icon: "defects",
          current: true,
        },
      ]}
    >
      <PageContainer>
        <PageHeader
          title="Defects"
          description="Keep a clear record of each physical copy's condition, including problems you've accepted or repaired."
        />
        {result.selected ? (
          <>
            <form
              action="/app/defects"
              method="get"
              className="max-w-2xl space-y-2"
            >
              <Label htmlFor="defect-copy">Collection copy</Label>
              <div className="flex min-w-0 flex-col gap-3 sm:flex-row">
                <select
                  className="min-h-12 w-full min-w-0 rounded-lg border border-input bg-background px-3 py-3 text-base focus-visible:outline-2 focus-visible:outline-ring"
                  id="defect-copy"
                  name="itemId"
                  defaultValue={result.selected.id}
                >
                  {result.items.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}
                </select>
                <Button type="submit" variant="outline">
                  View copy
                </Button>
              </div>
            </form>
            <DefectManager
              key={result.selected.id}
              item={result.selected}
              defects={result.defects}
              canManage={result.canManage}
            />
          </>
        ) : (
          <EmptyState
            title="No collection items yet"
            description="Defects belong to physical copies. Once a copy is in your collection, its condition can be recorded here."
          />
        )}
        <SignOutButton />
      </PageContainer>
    </ApplicationShell>
  );
}
