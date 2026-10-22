import { publicMediaRequest } from "@/server/http/public-media";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ useId: string }> },
) {
  const p = await params;
  return publicMediaRequest(request, { context: "site", ...p });
}
export const HEAD = GET;
