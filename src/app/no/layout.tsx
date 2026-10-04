import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "SCORVIK | Film fra nettsider",
  description: "Lag reklamefilmer og instruksjonsfilmer fra innholdet på nettsiden din.",
};

export default function NorwegianLayout({ children }: { children: ReactNode }) {
  return <div lang="nb">{children}</div>;
}