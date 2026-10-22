import { publicMediaRequest } from "@/server/http/public-media";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(
  request: Request,
  {
    params,
  }: { params: Promise<{ itemId: string; useKind: string; useId: string }> },
) {
  const p = await params;
  return publicMediaRequest(request, {
    context: "item",
    itemId: p.itemId,
    kind: p.useKind,
    useId: p.useId,
  });
}
export const HEAD = GET;
