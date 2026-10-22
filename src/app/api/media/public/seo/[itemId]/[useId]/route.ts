import { publicMediaRequest } from "@/server/http/public-media";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ itemId: string; useId: string }> },
) {
  return publicMediaRequest(request, { context: "seo", ...(await params) });
}
export const HEAD = GET;
