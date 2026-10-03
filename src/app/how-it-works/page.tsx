import Link from "next/link";

const steps = [
  ["01", "Get to know your brand", "We look for the words, images and details that make your website feel like you."],
  ["02", "Shape the story", "We'll bring those pieces together in a first storyboard. You decide what stays."],
  ["03", "Make it yours", "Choose the feeling, voice and format. Then take a look at your first preview."],
];

export default function HowItWorksPage() {
  return <div className="create-page info-page"><div className="page-heading"><div><span className="eyebrow">A thoughtful place to start</span><h1>From website to story.</h1><p>Your website gives us the details. You make the story your own.</p></div><Link href="/create" className="button">Start with your website <span aria-hidden="true">→</span></Link></div><div className="steps info-steps">{steps.map(([number,title,copy])=><article className="step" key={number}><span className="step-no">{number} / 03</span><h3>{title}</h3><p>{copy}</p></article>)}</div><section className="panel info-note"><span className="eyebrow">A first look</span><h2>Try the whole journey with a sample story.</h2><p>Explore the flow with sample details, or use your own website when you’re ready.</p><Link href="/create" className="text-link showcase-link">Take a look →</Link></section></div>;
}