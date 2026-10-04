"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "@/app/auth-actions";
import { LanguageSwitcher } from "@/components/language-switcher";
import { getCopy, localizedPath } from "@/lib/i18n/copy";

interface AppHeaderProps {
  authenticated: boolean;
}

export function AppHeader({ authenticated }: AppHeaderProps) {
  const pathname = usePathname() || "/";
  const locale = pathname === "/no" || pathname.startsWith("/no/") ? "no" : "en";
  const text = getCopy(locale);
  const href = (path: string) => localizedPath(locale, path);

  return (
    <header className="site-header">
      <Link className="brand" href={href("/")} aria-label={text.header.home}>
        <span className="brand-mark" aria-hidden="true"><i /></span>
        <span className="brand-wordmark">SCOR<span>VIK</span><small>{text.header.brandTagline}</small></span>
      </Link>
      <nav className="header-nav" aria-label="Main navigation">
        {authenticated ? <>
          <Link href={href("/create")}>{text.header.create}</Link>
          <Link href={href("/projects")}>{text.header.projects}</Link>
          <Link href={`${href("/create")}#music`}>{text.header.sound}</Link>
          <Link href={href("/pricing")}>{text.header.plans}</Link>
          <Link href={href("/account/security")}>{text.header.security}</Link>
        </> : <>
          <Link href={href("/how-it-works")}>{text.header.how}</Link>
          <Link href={href("/pricing")}>{text.header.plans}</Link>
        </>}
        <LanguageSwitcher />
      </nav>
      <div className="header-actions">
        {authenticated ? <>
          <span className="header-edition">{text.header.studio}</span>
          <Link className="button button-small" href={href("/create")}>{text.header.start} <span aria-hidden="true">↗</span></Link>
          <form action={signOut}><button className="header-sign-out" type="submit">{text.header.signOut}</button></form>
        </> : <>
          <Link href="/login">{text.header.signIn}</Link>
          <Link className="button button-small" href={href("/create")}>{text.header.start} <span aria-hidden="true">↗</span></Link>
        </>}
      </div>
    </header>
  );
}
