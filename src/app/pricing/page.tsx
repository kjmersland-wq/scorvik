import Link from "next/link";
import { getCopy, localizedPath, type Locale } from "@/lib/i18n/copy";

export default function PricingPage({ locale = "en" }: { locale?: Locale }) {
  const text = getCopy(locale).pricing;
  const href = localizedPath(locale, "/create");
  return <div className="create-page info-page"><div className="page-heading"><div><span className="eyebrow">{text.eyebrow}</span><h1>{text.title}</h1><p>{text.description}</p></div></div><section className="panel pricing-panel"><div><span className="eyebrow">{text.offer}</span><h2>{text.cardTitle}</h2><p>{text.cardDescription}</p><div className="pricing-line"><b>$0</b><span>{text.priceSuffix}</span></div><div className="tag-list">{text.tags.map((tag) => <span className="tag" key={tag}>{tag}</span>)}</div></div><Link href={href} className="button">{text.start} <span aria-hidden="true">→</span></Link></section><p className="field-caption pricing-footnote">{text.footnote}</p></div>;
}