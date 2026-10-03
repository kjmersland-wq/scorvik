import Link from "next/link";

export function AppHeader() {
  return (
    <header className="site-header">
      <Link className="brand" href="/" aria-label="SCORVIK home">
        <span className="brand-mark" aria-hidden="true"><i /></span>
        <span className="brand-wordmark">SCOR<span>VIK</span><small>CREATIVE VIDEO ENGINE</small></span>
      </Link>
      <nav className="header-nav" aria-label="Main navigation">
        <Link href="/create">Create</Link>
        <Link href="/projects">Projects</Link>
        <Link href="/create#music">Music</Link>
        <Link href="/pricing">Pricing</Link>
      </nav>
      <div className="header-actions">
        <span className="header-edition">STUDIO&nbsp; / &nbsp;01</span>
        <Link className="button button-small" href="/create">NEW PRODUCTION <span aria-hidden="true">↗</span></Link>
      </div>
    </header>
  );
}
