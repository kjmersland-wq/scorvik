import { LandingPage } from "@/components/landing-page";
import { AnonymousPasswordBox } from "@/components/anonymous-password-box";
import { hasValidPreviewSession } from "@/lib/auth/session";

export default async function Home() {
  const authenticated = await hasValidPreviewSession();
  return <><LandingPage />{!authenticated && <AnonymousPasswordBox locale="en" />}</>;
}
