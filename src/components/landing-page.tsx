import Link from "next/link";
import { LandingWorkbench } from "@/components/landing-workbench";
import { LandingPosterWall } from "@/components/landing-poster-wall";
import { Reveal } from "@/components/landing-reveal";
import { getCopy, localizedPath, type Locale } from "@/lib/i18n/copy";
import styles from "./landing-v2.module.css";

const bentoSpans = [styles.span3, styles.span3, styles.span2, styles.span2, styles.span2, styles.span6];
const photo = (id: string) => ({ backgroundImage: `url("https://images.unsplash.com/${id}?auto=format&fit=crop&w=300&q=60")` });
const beatHeights = [38, 62, 30, 80, 46, 70, 34, 90, 52, 66, 28, 76, 44, 58];
const beatCuts = new Set([3, 7, 11]);

export function LandingPage({ locale = "en" }: { locale?: Locale }) {
  const text = getCopy(locale).landing;
  const href = (path: string) => localizedPath(locale, path);
  const stepCount = String(text.steps.length).padStart(2, "0");

  const visuals = [
    <div className={styles.read} key="read"><div className={styles.readLines}><i /><i /><i /><i /></div><span className={styles.readArrow} aria-hidden="true">→</span><div className={styles.readScenes}><b>01</b><b>02</b><b>03</b></div></div>,
    <div className={styles.player} key="film"><span className={styles.playBtn} aria-hidden="true">▶</span><div className={styles.progress}><i /></div><small>MP4 · H.264</small></div>,
    <div className={styles.pics} key="pics"><i style={photo("photo-1441986300917-64674bd600d8")} /><i style={photo("photo-1500530855697-b586d89ba3ee")} /><i style={photo("photo-1470071459604-3b5ec3a7fe05")} /></div>,
    <div className={styles.beats} key="beats" aria-hidden="true">{beatHeights.map((h, i) => <i key={i} className={beatCuts.has(i) ? styles.cut : ""} style={{ "--h": `${h}%` } as React.CSSProperties} />)}</div>,
    <div className={styles.type} key="type">{text.workbench.filmStart} <em>{text.workbench.filmEnd}</em></div>,
    <div className={styles.device} key="device"><span>MP4</span><span>EN · NO</span><span>16:9</span><span>9:16</span><span>1:1</span><span>4:5</span></div>,
  ];

  return (
    <div className="landing">
      <section className={styles.hero}>
        <div className={styles.glow} aria-hidden="true"><i /><i /><i /></div>
        <div className={styles.heroInner}>
          <span className={styles.pill}><i className={styles.pillDot} />{text.heroEyebrow}</span>
          <h1 className={styles.title}>{text.titleFirst} {text.titleSecond} <span>{text.titleLast}</span></h1>
          <p className={styles.lead}>{text.heroDescription}</p>
          <form action={href("/create")} method="get" className={styles.prompt}>
            <label className={styles.promptField}>
              <svg className={styles.promptIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.6 2.7 2.6 15.3 0 18M12 3c-2.6 2.7-2.6 15.3 0 18" /></svg>
              <span className="sr-only">{text.urlLabel}</span>
              <input className={styles.promptInput} type="text" name="url" inputMode="url" autoComplete="url" placeholder={text.urlPlaceholder} />
            </label>
            <button type="submit" className={`button ${styles.promptButton}`}>{text.urlButton} <span aria-hidden="true">↗</span></button>
          </form>
          <ul className={styles.chips}>{text.heroChips.map((chip) => <li key={chip}>{chip}</li>)}</ul>
          <a href="#how-it-works" className={styles.howLink}>{text.howLink}</a>
        </div>
        <div className={styles.stage}><div className={styles.stageTilt}><LandingWorkbench locale={locale} showForm={false} /></div></div>
      </section>

      <div className="proof-strip" aria-label={text.helpEyebrow}>{text.proof.map((item, index) => <div className="proof-item" key={item}><b>{String(index + 1).padStart(2, "0")}</b>{item}</div>)}</div>

      <Reveal><section className="section" id="how-it-works"><div className="section-heading"><span className="eyebrow">{text.helpEyebrow}</span><h2>{text.helpTitle}</h2><p>{text.helpDescription}</p></div><div className={`steps ${styles.steps4}`}>{text.steps.map(([title, description], index) => <article className="step" key={title}><span className="step-no">{String(index + 1).padStart(2, "0")} / {stepCount}</span><h3>{title}</h3><p>{description}</p></article>)}</div></section></Reveal>

      <Reveal><section className="section showcase"><div className="section-heading"><span className="eyebrow">{text.showEyebrow}</span><h2>{text.showTitle}</h2><p>{text.showDescription}</p><Link className="text-link showcase-link" href={href("/create")}>{text.shapeStory} <span aria-hidden="true">→</span></Link></div><div className="showcase-board" aria-hidden="true"><div className="board-top"><span>NORTHLINE.STUDIO / {text.workbench.scenes}</span><span>00:30 · 16:9</span></div><div className="board-scenes"><div className="board-scene">01 / {text.hook}</div><div className="board-scene">02 / {text.story}</div><div className="board-scene">03 / {text.product}</div></div><div className="board-timeline"><i /><i /><i /></div></div></section></Reveal>

      <Reveal><section className="section"><div className="section-heading"><span className="eyebrow">{text.capEyebrow}</span><h2>{text.capTitle}</h2><p>{text.capDescription}</p></div>
        <div className={styles.bento}>{text.caps.map(([tag, title, description], index) => <article className={`${styles.card} ${bentoSpans[index]}`} key={tag}><span className={styles.tag}>{tag}</span><h3>{title}</h3><p>{description}</p><div className={styles.visual}>{visuals[index]}</div></article>)}</div>
      </section></Reveal>

      <Reveal><section className={`section ${styles.posters}`}><div className={styles.posterGrid}>
        <div className={styles.posterCopy}><span className="eyebrow">{text.posterEyebrow}</span><h2>{text.posterTitle}</h2><p>{text.posterDescription}</p><ul className={styles.points}>{text.posterPoints.map((point) => <li key={point}>{point}</li>)}</ul><span className={styles.posterNote}>{text.posterNote}</span><Link href={href("/create")} className="button">{text.posterCta} <span aria-hidden="true">↗</span></Link></div>
        <LandingPosterWall claim={locale === "no" ? "Laget for alt imellom." : "Made for everything between."} host="northline.studio" sizesLabel={text.posterSizesLabel} />
      </div></section></Reveal>

      <Reveal><section className="section format-section"><div className="section-heading"><span className="eyebrow">{text.formatEyebrow}</span><h2>{text.formatTitle}</h2><p>{text.formatDescription}</p></div><div className="format-showcase"><div className="format-copy"><div><b>16:9</b><span>{text.formatWide}</span></div><div><b>9:16</b><span>{text.formatTall}</span></div><div><b>1:1</b><span>{text.formatSquare}</span></div><div><b>4:5</b><span>{text.formatFeed}</span></div></div><div className="format-frames" aria-hidden="true"><div className="format-frame landscape"><span>{text.workbench.frameStory} / 16:9</span></div><div className="format-frame portrait"><span>{text.workbench.frameStory} / 9:16</span></div><div className="format-frame square"><span>{text.workbench.frameStory} / 1:1</span></div></div></div></section></Reveal>

      <Reveal><section className="section versions-section"><div className="versions-copy"><span className="eyebrow">{text.versionsEyebrow}</span><h2>{text.versionsTitle}</h2><p>{text.versionsDescription}</p><Link href={href("/create")} className="button button-light">{text.tryDirection} <span aria-hidden="true">→</span></Link></div><div className="version-list">{text.styles.map((style, index) => <div key={style}><span>{String(index + 1).padStart(2, "0")}</span><b>{style}</b><small>{text.styleNotes[index]}</small></div>)}</div></section></Reveal>

      <Reveal><section className="section usecase-section"><div className="section-heading"><span className="eyebrow">{text.usecaseEyebrow}</span><h2>{text.usecaseTitle}</h2></div><div className="usecase-list">{text.usecases.map((item) => <span key={item}>{item}</span>)}</div></section></Reveal>

      <Reveal><section className="section library-section"><div className="library-copy"><span className="eyebrow">{text.libraryEyebrow}</span><h2>{text.libraryTitle}</h2><p>{text.libraryDescription}</p><Link href={href("/projects")} className="text-link showcase-link">{text.seeFilms} →</Link></div><div className="library-preview"><div className="library-preview-head"><span>{locale === "no" ? "NYLIGE HISTORIER" : "A FEW RECENT STORIES"}</span><span>{locale === "no" ? "SE NÆRMERE" : "TAKE A LOOK"} ↗</span></div><div className="library-row"><i className="library-thumb"/><span><b>{text.libraryItems[0][0]}</b><small>northline.studio</small></span><em>{text.libraryItems[1][0]}</em></div><div className="library-row"><i className="library-thumb second"/><span><b>{text.libraryItems[0][1]}</b><small>quietform.co</small></span><em>{text.libraryItems[1][1]}</em></div></div></section></Reveal>

      <Reveal><section className="section faq-section"><div className="section-heading"><span className="eyebrow">{text.faqEyebrow}</span><h2>{text.faqTitle}</h2></div><div className="faq-list">{text.faq.map(([question, answer]) => <details key={question}><summary>{question}</summary><p>{answer}</p></details>)}</div></section></Reveal>

      <Reveal><section className="section pricing-strip"><div><span className="eyebrow">{text.pricingEyebrow}</span><h2>{text.pricingTitle}</h2><p>{text.pricingDescription}</p></div><Link href={href("/pricing")} className="button button-light">{text.seePlans} <span aria-hidden="true">→</span></Link></section></Reveal>

      <Reveal><section className="section closing"><div><span className="eyebrow">{text.closingEyebrow}</span><h2>{text.closingTitle}</h2></div><Link href={href("/create")} className="button button-lime">{text.start} <span aria-hidden="true">↗</span></Link></section></Reveal>

      <footer className="footer"><Link className="brand" href={href("/")}><span className="brand-mark" aria-hidden="true"><i /></span><span>SCORVIK</span></Link><span>{text.footerLine}</span><Link href={href("/projects")}>{text.seeFilms} →</Link></footer>
    </div>
  );
}
