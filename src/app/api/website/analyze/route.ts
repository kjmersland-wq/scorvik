import { NextResponse } from "next/server";

export const runtime = "nodejs";

const publicErrors: Record<string, string> = {
  INVALID_URL: "That link doesn't seem to work yet. Check it and we'll try again.",
  BLOCKED_URL: "We can only take a look at public websites. Try a public link instead.",
  DNS_FAILED: "We couldn't find that website. Check the address and try again.",
  TIMEOUT: "That page is taking a little while to respond. Try again in a moment.",
  ACCESS_DENIED: "This site isn't open to visitors right now. Try another public page.",
  UNSUPPORTED_CONTENT: "That link doesn't lead to a page we can read. Try another one.",
  RESPONSE_TOO_LARGE: "This page has a lot to take in. Try a simpler page, like your homepage.",
  EMPTY_PAGE: "We couldn't find enough to work with on this page. Try another one.",
  UNAVAILABLE: "We couldn't reach that page just now. Check the link and try again.",
};

export async function POST() {
  return NextResponse.json(
    { error: "Website analysis is closed while the engine is being built." },
    { status: 403 },
  );
}
