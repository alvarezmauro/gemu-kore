import { completeRequest } from "@/server/http/assets";
export const runtime = "nodejs";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return completeRequest(request, (await params).id);
}
