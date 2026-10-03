const outputOptions = [
  ["YouTube", "youtube", "16:9"],
  ["Instagram Reels", "instagram-reels", "9:16"],
  ["Instagram Feed", "instagram-feed", "4:5"],
  ["TikTok", "tiktok", "9:16"],
  ["Facebook", "facebook-landscape", "16:9"],
  ["YouTube Shorts", "youtube-shorts", "9:16"],
] as const;

export function LandingWorkbench() {
  return (
    <div className="landing-workbench" aria-label="Set up a website-to-video project">
      <div className="workbench-topline"><span><i /> PRODUCTION WORKSPACE</span><span>DEMO / 01</span></div>
      <div className="workbench-route"><div className="route-step"><span>01 / INPUT</span><b>Website</b></div><span className="route-connector" aria-hidden="true">→</span><div className="route-step"><span>02 / DIRECTION</span><b>Story</b></div><span className="route-connector" aria-hidden="true">→</span><div className="route-step"><span>03 / OUTPUT</span><b>Film</b></div></div>
      <div className="workbench-film" aria-label="Preview of a finished brand film"><div className="workbench-film-meta"><span>NORTHLINE STUDIO</span><span>FIRST CUT&nbsp; / &nbsp;00:30</span></div><div className="workbench-film-title">Made for<br /><em>the in-between.</em></div><div className="workbench-film-bottom"><span>STORYBOARD&nbsp; 06 SCENES</span><span className="workbench-pulse">●&nbsp; READY TO DIRECT</span></div></div>
      <div className="workbench-scene-rail" aria-label="Storyboard scene preview"><div className="rail-scene selected"><i className="rail-image rail-one"/><span>01&nbsp; / &nbsp;THE HOOK</span></div><div className="rail-scene"><i className="rail-image rail-two"/><span>02&nbsp; / &nbsp;THE STORY</span></div><div className="rail-scene"><i className="rail-image rail-three"/><span>03&nbsp; / &nbsp;THE PRODUCT</span></div><span className="rail-more">+03</span></div>
      <form action="/create" method="get" className="workbench-form">
        <label className="workbench-url"><span>YOUR WEBSITE</span><input name="url" type="text" inputMode="url" autoComplete="url" placeholder="Paste a website URL" required /></label>
        <div className="workbench-controls">
          <label><span>PUBLISH TO</span><select name="platform" defaultValue="instagram-reels">{outputOptions.map(([label, id]) => <option key={id} value={id}>{label}</option>)}</select></label>
          <label><span>FORMAT</span><select name="format" defaultValue="9:16"><option>16:9</option><option>9:16</option><option>4:5</option><option>1:1</option></select></label>
          <label><span>LENGTH</span><select name="duration" defaultValue="30"><option value="15">15 sec</option><option value="20">20 sec</option><option value="30">30 sec</option><option value="45">45 sec</option><option value="60">60 sec</option></select></label>
          <label><span>LANGUAGE</span><select name="language" defaultValue="English"><option>English</option><option>Norsk</option><option>Deutsch</option><option>Français</option><option>Español</option></select></label>
          <label><span>ART DIRECTION</span><select name="style" defaultValue="Editorial"><option>Editorial</option><option>Cinematic</option><option>Clean</option><option>Energetic</option><option>Minimal</option></select></label>
        </div>
        <button type="submit" className="button workbench-submit">BUILD THE STORY <span aria-hidden="true">↗</span></button>
      </form>
      <div className="workbench-footnote"><span>YOUR WEBSITE IS THE CREATIVE BRIEF.</span><span>MOCK &amp; REAL MODE</span></div>
    </div>
  );
}
