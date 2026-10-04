"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { getCopy } from "@/lib/i18n/copy";

export function LanguageSwitcher() {
  const pathname = usePathname() || "/";
  const norwegian = pathname === "/no" || pathname.startsWith("/no/");
  const englishPath = norwegian ? pathname.slice(3) || "/" : pathname;
  const norwegianPath = norwegian ? pathname : pathname === "/" ? "/no" : `/no${pathname}`;
  const text = getCopy(norwegian ? "no" : "en");

  return (
    <span aria-label={text.language.label}>
      <Link href={englishPath} aria-current={!norwegian ? "page" : undefined}>EN</Link>
      <span aria-hidden="true"> / </span>
      <Link href={norwegianPath} aria-current={norwegian ? "page" : undefined}>NO</Link>
    </span>
  );
}