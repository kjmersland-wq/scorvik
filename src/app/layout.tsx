import type { Metadata } from "next";
import { hasValidPreviewSession } from "@/lib/auth/session";
import { AppHeader } from "@/components/app-header";
import "./globals.css";

export const metadata: Metadata = {
  title: "SCORVIK | Your story, in motion",
  description: "Find the story in your website and shape it into a film.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const authenticated = await hasValidPreviewSession();

  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body><AppHeader authenticated={authenticated} /><main className="app-main">{children}</main></body>
    </html>
  );
}
