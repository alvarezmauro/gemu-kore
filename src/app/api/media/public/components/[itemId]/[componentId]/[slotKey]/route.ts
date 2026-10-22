import { publicMediaRequest } from "@/server/http/public-media";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(
  request: Request,
  {
    params,
  }: {
    params: Promise<{ itemId: string; componentId: string; slotKey: string }>;
  },
) {
  const p = await params;
  return publicMediaRequest(request, { context: "component", ...p });
}
export const HEAD = GET;
