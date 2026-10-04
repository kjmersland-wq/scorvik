import { LandingPage } from "@/components/landing-page";
import { AnonymousPasswordBox } from "@/components/anonymous-password-box";
import { hasValidPreviewSession } from "@/lib/auth/session";

export default async function NorwegianHomePage() {
  const authenticated = await hasValidPreviewSession();
  return <><LandingPage locale="no" />{!authenticated && <AnonymousPasswordBox locale="no" />}</>;
}