import { redirect, notFound } from "next/navigation";
import { ApplicationShell } from "@/components/layout/application-shell";
import { PageContainer } from "@/components/layout/page-container";
import { AuthCard } from "@/features/auth/components/auth-card";
import { SignOutButton } from "@/features/auth/components/sign-out-button";
import { PaletteTrigger } from "@/features/search/components/command-palette";
import { getAccessoryCopyPageData } from "@/features/accessories/copy-queries.server";
import { AccessoryCopy } from "@/features/accessories/components/accessory-copy";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "Accessory copy | GemuKore",
  referrer: "same-origin",
};
export default async function AccessoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const raw = query.modelPage ?? "1";
  const modelPage =
    typeof raw === "string" && /^[1-9]\d{0,3}$/.test(raw) ? Number(raw) : 0;
  const rawGallery = query.galleryPage ?? "1";
  const galleryPage =
    typeof rawGallery === "string" && /^[1-9]\d{0,3}$/.test(rawGallery)
      ? Number(rawGallery)
      : 0;
  const result = await getAccessoryCopyPageData({ id, modelPage, galleryPage });
  if (result.status !== "authorized") {
    if (result.status === "UNAUTHENTICATED") redirect("/login");
    if (result.status === "DENIED") redirect("/access-denied");
    if (result.status === "NOT_FOUND") notFound();
    return (
      <AuthCard
        title="Accessory unavailable"
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
                label: "Add accessory",
                href: "/app/accessories/new",
                icon: "forms" as const,
              },
            ]
          : []),
        { label: "Locations", href: "/app/locations", icon: "locations" },
        { label: "Photos", href: "/app/media", icon: "photos" },
      ]}
    >
      <PageContainer>
        <AccessoryCopy
          detail={result.detail}
          presentation={result.presentation}
          models={result.models}
          locations={result.locations}
          canManage={result.canManage}
        />
      </PageContainer>
    </ApplicationShell>
  );
}
