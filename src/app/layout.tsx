import type { Metadata } from "next";
import { hasValidPreviewSession } from "@/lib/auth/session";
import { AppHeader } from "@/components/app-header";
import "./globals.css";

export const metadata: Metadata = {
  title: "Private preview",
  description: "Sign in to continue.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const authenticated = await hasValidPreviewSession();

  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body>{authenticated && <AppHeader />}<main className={authenticated ? "app-main" : "login-main"}>{children}</main></body>
    </html>
  );
}
