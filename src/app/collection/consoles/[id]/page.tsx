import { publicMetadata } from "@/features/public-collection/seo.server";
import { PublicDetailPage } from "@/features/public-collection/components/public-detail-page";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <PublicDetailPage type="CONSOLE" id={id} />;
}

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return publicMetadata({
    kind: "item",
    type: "CONSOLE",
    id: (await params).id,
    params: await searchParams,
  });
}
