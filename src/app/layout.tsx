import type { Metadata } from "next";
import { AppHeader } from "@/components/app-header";
import "./globals.css";

export const metadata: Metadata = {
  title: "SiteRender-AI | From website to finished video",
  description: "Turn any website into a polished marketing video. SiteRender finds the story already there and builds the scenes for you.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body><AppHeader /><main className="app-main">{children}</main></body>
    </html>
  );
}
