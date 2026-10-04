import Link from "next/link";
import { LandingWorkbench } from "@/components/landing-workbench";
import { getCopy, localizedPath, type Locale } from "@/lib/i18n/copy";

export function LandingPage({ locale = "en" }: { locale?: Locale }) {
  const text = getCopy(locale).landing;
  const href = (path: string) => localizedPath(locale, path);

  return (
    <div className="landing">
      <section className="hero">
        <div className="hero-copy">
          <span className="eyebrow">{text.heroEyebrow}</span>
          <h1>{text.titleFirst}<br />{text.titleSecond} <span>{text.titleLast}</span></h1>
          <p>{text.heroDescription}</p>
          <div className="hero-cta"><Link href={href("/create")} className="button">{text.start} <span aria-hidden="true">↗</span></Link><a href="#how-it-works" className="button button-light">{text.howLink}</a></div>
          <div className="hero-note"><span>{text.routeNote}</span><span>{text.brandNote}</span></div>
        </div>
        <LandingWorkbench locale={locale} />
      </section>
      <div className="proof-strip" aria-label={text.helpEyebrow}>{text.proof.map((item, index) => <div className="proof-item" key={item}><b>{String(index + 1).padStart(2, "0")}</b>{item}</div>)}</div>
      <section className="section" id="how-it-works"><div className="section-heading"><span className="eyebrow">{text.helpEyebrow}</span><h2>{text.helpTitle}</h2><p>{text.helpDescription}</p></div><div className="steps">{text.steps.map(([title, description], index) => <article className="step" key={title}><span className="step-no">{String(index + 1).padStart(2, "0")} / 03</span><h3>{title}</h3><p>{description}</p></article>)}</div></section>
      <section className="section showcase"><div className="section-heading"><span className="eyebrow">{text.showEyebrow}</span><h2>{text.showTitle}</h2><p>{text.showDescription}</p><Link className="text-link showcase-link" href={href("/create")}>{text.shapeStory} <span aria-hidden="true">→</span></Link></div><div className="showcase-board" aria-hidden="true"><div className="board-top"><span>NORTHLINE.STUDIO / {text.workbench.scenes}</span><span>00:30 · 16:9</span></div><div className="board-scenes"><div className="board-scene">01 / {text.hook}</div><div className="board-scene">02 / {text.story}</div><div className="board-scene">03 / {text.product}</div></div><div className="board-timeline"><i /><i /><i /></div></div></section>
      <section className="section format-section"><div className="section-heading"><span className="eyebrow">{text.formatEyebrow}</span><h2>{text.formatTitle}</h2><p>{text.formatDescription}</p></div><div className="format-showcase"><div className="format-copy"><div><b>16:9</b><span>{text.formatWide}</span></div><div><b>9:16</b><span>{text.formatTall}</span></div><div><b>1:1</b><span>{text.formatSquare}</span></div><div><b>4:5</b><span>{text.formatFeed}</span></div></div><div className="format-frames" aria-hidden="true"><div className="format-frame landscape"><span>{text.workbench.frameStory} / 16:9</span></div><div className="format-frame portrait"><span>{text.workbench.frameStory} / 9:16</span></div><div className="format-frame square"><span>{text.workbench.frameStory} / 1:1</span></div></div></div></section>
      <section className="section versions-section"><div className="versions-copy"><span className="eyebrow">{text.versionsEyebrow}</span><h2>{text.versionsTitle}</h2><p>{text.versionsDescription}</p><Link href={href("/create")} className="button button-light">{text.tryDirection} <span aria-hidden="true">→</span></Link></div><div className="version-list">{text.styles.map((style, index) => <div key={style}><span>{String(index + 1).padStart(2, "0")}</span><b>{style}</b><small>{text.styleNotes[index]}</small></div>)}</div></section>
      <section className="section usecase-section"><div className="section-heading"><span className="eyebrow">{text.usecaseEyebrow}</span><h2>{text.usecaseTitle}</h2></div><div className="usecase-list">{text.usecases.map((item) => <span key={item}>{item}</span>)}</div></section>
      <section className="section library-section"><div className="library-copy"><span className="eyebrow">{text.libraryEyebrow}</span><h2>{text.libraryTitle}</h2><p>{text.libraryDescription}</p><Link href={href("/projects")} className="text-link showcase-link">{text.seeFilms} →</Link></div><div className="library-preview"><div className="library-preview-head"><span>{locale === "no" ? "NYLIGE HISTORIER" : "A FEW RECENT STORIES"}</span><span>{locale === "no" ? "SE NÆRMERE" : "TAKE A LOOK"} ↗</span></div><div className="library-row"><i className="library-thumb"/><span><b>{text.libraryItems[0][0]}</b><small>northline.studio</small></span><em>{text.libraryItems[1][0]}</em></div><div className="library-row"><i className="library-thumb second"/><span><b>{text.libraryItems[0][1]}</b><small>quietform.co</small></span><em>{text.libraryItems[1][1]}</em></div></div></section>
      <section className="section faq-section"><div className="section-heading"><span className="eyebrow">{text.faqEyebrow}</span><h2>{text.faqTitle}</h2></div><div className="faq-list">{text.faq.map(([question, answer]) => <details key={question}><summary>{question}</summary><p>{answer}</p></details>)}</div></section>
      <section className="section pricing-strip"><div><span className="eyebrow">{text.pricingEyebrow}</span><h2>{text.pricingTitle}</h2><p>{text.pricingDescription}</p></div><Link href={href("/pricing")} className="button button-light">{text.seePlans} <span aria-hidden="true">→</span></Link></section>
      <section className="section closing"><div><span className="eyebrow">{text.closingEyebrow}</span><h2>{text.closingTitle}</h2></div><Link href={href("/create")} className="button button-lime">{text.start} <span aria-hidden="true">↗</span></Link></section>
      <footer className="footer"><Link className="brand" href={href("/")}><span className="brand-mark" aria-hidden="true"><i /></span><span>SCORVIK</span></Link><span>{text.footerLine}</span><Link href={href("/projects")}>{text.seeFilms} →</Link></footer>
    </div>
  );
}
