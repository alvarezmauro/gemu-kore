import { privateMediaRequest } from "@/server/http/assets";
export const runtime = "nodejs";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return privateMediaRequest(request, (await params).id);
}
export const HEAD = GET;
