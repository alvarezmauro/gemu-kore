import { publicMetadata } from "@/features/public-collection/seo.server";
import { PublicBrowsePage } from "@/features/public-collection/components/public-browse-page";
import type { PublicBrowseParams } from "@/features/public-collection/browsing";

export default function Page({
  searchParams,
}: {
  searchParams: Promise<PublicBrowseParams>;
}) {
  return <PublicBrowsePage category="games" searchParams={searchParams} />;
}

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<PublicBrowseParams>;
}) {
  return publicMetadata({
    kind: "category",
    category: "games",
    params: await searchParams,
  });
}
