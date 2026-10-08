import { hasValidPreviewSession } from "@/lib/auth/session";
import { streamMusic } from "@/lib/music/serve";

export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ file: string }> }) {
  if (!await hasValidPreviewSession()) return new Response("Sign in first.", { status: 401 });
  const { file } = await context.params;
  return streamMusic(file, request.headers.get("range"));
}
