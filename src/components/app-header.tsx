import Link from "next/link";
import { signOut } from "@/app/auth-actions";

interface AppHeaderProps {
  authenticated: boolean;
}

export function AppHeader({ authenticated }: AppHeaderProps) {
  return (
    <header className="site-header">
      <Link className="brand" href="/" aria-label="SCORVIK home">
        <span className="brand-mark" aria-hidden="true"><i /></span>
        <span className="brand-wordmark">SCOR<span>VIK</span><small>YOUR CREATIVE STUDIO</small></span>
      </Link>
      <nav className="header-nav" aria-label="Main navigation">
        {authenticated ? <>
          <Link href="/create">Make a film</Link>
          <Link href="/projects">My films</Link>
          <Link href="/create#music">Sound</Link>
          <Link href="/pricing">Plans</Link>
          <Link href="/account/security">Security</Link>
        </> : <>
          <Link href="/how-it-works">How it works</Link>
          <Link href="/pricing">Plans</Link>
        </>}
      </nav>
      <div className="header-actions">
        {authenticated ? <>
          <span className="header-edition">YOUR STUDIO</span>
          <Link className="button button-small" href="/create">START WITH YOUR WEBSITE <span aria-hidden="true">↗</span></Link>
          <form action={signOut}><button className="header-sign-out" type="submit">Sign out</button></form>
        </> : <>
          <Link href="/login">Sign in</Link>
          <Link className="button button-small" href="/create">START WITH YOUR WEBSITE <span aria-hidden="true">↗</span></Link>
        </>}
      </div>
    </header>
  );
}
