import { getCopy, localizedPath, type Locale } from "@/lib/i18n/copy";

export function LandingWorkbench({ locale = "en", showForm = true }: { locale?: Locale; showForm?: boolean }) {
  const text = getCopy(locale).landing.workbench;
  const landing = getCopy(locale).landing;

  return (
    <div className="landing-workbench" aria-label={text.aria}>
      <div className="workbench-topline"><span><i /> {text.space}</span><span>{text.firstLook}</span></div>
      <div className="workbench-route"><div className="route-step"><span>01 / {text.start}</span><b>{text.website}</b></div><span className="route-connector" aria-hidden="true">→</span><div className="route-step"><span>02 / {text.shape}</span><b>{text.story}</b></div><span className="route-connector" aria-hidden="true">→</span><div className="route-step"><span>03 / {text.share}</span><b>{text.film}</b></div></div>
      <div className="workbench-film" aria-label={text.firstLook}><div className="workbench-film-meta"><span>{text.brand}</span><span>{text.look}&nbsp; / &nbsp;00:30</span></div><div className="workbench-film-title">{text.filmStart}<br /><em>{text.filmEnd}</em></div><div className="workbench-film-bottom"><span>{text.scenes}&nbsp; 06</span><span className="workbench-pulse">●&nbsp; {text.ready}</span></div></div>
      <div className="workbench-scene-rail" aria-label={text.firstLook}><div className="rail-scene selected"><i className="rail-image rail-one"/><span>01&nbsp; / &nbsp;{landing.hook}</span></div><div className="rail-scene"><i className="rail-image rail-two"/><span>02&nbsp; / &nbsp;{landing.story}</span></div><div className="rail-scene"><i className="rail-image rail-three"/><span>03&nbsp; / &nbsp;{landing.product}</span></div><span className="rail-more">+03</span></div>
      {showForm ? (
        <form action={localizedPath(locale, "/create")} method="get" className="workbench-form">
          <label className="workbench-url"><span>{text.startUrl}</span><input type="text" name="url" inputMode="url" autoComplete="url" placeholder={landing.urlPlaceholder} /></label>
          <button type="submit" className="button workbench-submit">{text.submit} <span aria-hidden="true">↗</span></button>
        </form>
      ) : null}
      <div className="workbench-footnote"><span>{text.footerStart}</span><span>{text.footerSample}</span></div>
    </div>
  );
}
