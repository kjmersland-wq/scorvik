import Link from "next/link";

const steps = [
  ["01", "Read", "SiteRender looks for your site’s language, imagery, product details and visual cues."],
  ["02", "Compose", "Those ingredients become a first storyboard: a hook, a story, the product and a clear next step."],
  ["03", "Refine", "Edit the scenes, choose a format and voice, then ask SiteRender to build a first-cut preview."],
];

export default function HowItWorksPage() {
  return <div className="create-page info-page"><div className="page-heading"><div><span className="eyebrow">A clearer creative process</span><h1>From URL to story.</h1><p>Your website is the source material. You direct the final cut.</p></div><Link href="/create" className="button">Start with a URL <span aria-hidden="true">→</span></Link></div><div className="steps info-steps">{steps.map(([number,title,copy])=><article className="step" key={number}><span className="step-no">{number} / 03</span><h3>{title}</h3><p>{copy}</p></article>)}</div><section className="panel info-note"><span className="eyebrow">A note on this preview</span><h2>Today, the workflow is in mock mode.</h2><p>The experience uses curated demo imagery and sample story data, so you can explore the entire creation process without connecting an external service.</p><Link href="/create" className="text-link showcase-link">Try the creation flow →</Link></section></div>;
}