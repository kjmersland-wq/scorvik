import Link from "next/link";
import { getCopy, localizedPath, type Locale } from "@/lib/i18n/copy";

export default function HowItWorksPage({ locale = "en" }: { locale?: Locale }) {
  const text = getCopy(locale).how;
  const href = localizedPath(locale, "/create");
  return <div className="create-page info-page"><div className="page-heading"><div><span className="eyebrow">{text.eyebrow}</span><h1>{text.title}</h1><p>{text.description}</p></div><Link href={href} className="button">{text.start} <span aria-hidden="true">→</span></Link></div><div className="steps info-steps">{text.steps.map(([title,description],index)=><article className="step" key={title}><span className="step-no">{String(index+1).padStart(2,"0")} / 03</span><h3>{title}</h3><p>{description}</p></article>)}</div><section className="panel info-note"><span className="eyebrow">{text.noteEyebrow}</span><h2>{text.noteTitle}</h2><p>{text.noteDescription}</p><Link href={href} className="text-link showcase-link">{text.takeLook} →</Link></section></div>;
}