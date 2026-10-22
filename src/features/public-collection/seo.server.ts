import "server-only";
import type { Metadata } from "next";
import { connection } from "next/server";
import { getPublicSeo } from "@/server/services/public-collection/seo";
import { publicSeoFallback } from "./seo";
export async function publicMetadata(input: unknown): Promise<Metadata> {
  await connection();
  const data = await getPublicSeo(input).catch(() => ({
    ...publicSeoFallback,
  }));
  const images = "image" in data && data.image ? [data.image] : [];
  return {
    title: data.title,
    description: data.description,
    robots: { index: data.index, follow: data.index },
    alternates: { canonical: "canonical" in data ? data.canonical : null },
    openGraph: {
      type: "website",
      title: data.title,
      description: data.description,
      ...("canonical" in data ? { url: data.canonical } : {}),
      images,
    },
    twitter: {
      card: images.length ? "summary_large_image" : "summary",
      title: data.title,
      description: data.description,
      images,
    },
  };
}
