import "server-only";

import { cookies } from "next/headers";
import { isCurrentPreviewSessionToken } from "./preview-auth";
import { PREVIEW_SESSION_COOKIE } from "./session-core";

export async function hasValidPreviewSession(): Promise<boolean> {
  const cookieStore = await cookies();
  return isCurrentPreviewSessionToken(cookieStore.get(PREVIEW_SESSION_COOKIE)?.value, process.env.SCORVIK_AUTH_SECRET);
}