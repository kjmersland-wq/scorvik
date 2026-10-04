import type { Metadata } from "next";
import { AnonymousPasswordBox } from "@/components/anonymous-password-box";

export const metadata: Metadata = {
  title: "SCORVIK | Preview access",
  description: "Open the SCORVIK preview with your password.",
};

interface LoginPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const nextParam = params.next;
  const nextPath = typeof nextParam === "string" ? nextParam : "/create";
  const locale = nextPath === "/no" || nextPath.startsWith("/no/") ? "no" : "en";
  return <AnonymousPasswordBox locale={locale} nextPath={nextPath} standalone />;
}