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
    <div className="landing-workbench" aria-label="Start a film with your website">
      <div className="workbench-topline"><span><i /> YOUR CREATIVE SPACE</span><span>A FIRST LOOK</span></div>
      <div className="workbench-route"><div className="route-step"><span>01 / START</span><b>Website</b></div><span className="route-connector" aria-hidden="true">→</span><div className="route-step"><span>02 / SHAPE</span><b>Story</b></div><span className="route-connector" aria-hidden="true">→</span><div className="route-step"><span>03 / SHARE</span><b>Film</b></div></div>
      <div className="workbench-film" aria-label="A first look at a brand film"><div className="workbench-film-meta"><span>NORTHLINE STUDIO</span><span>YOUR FIRST LOOK&nbsp; / &nbsp;00:30</span></div><div className="workbench-film-title">Made for<br /><em>the in-between.</em></div><div className="workbench-film-bottom"><span>YOUR STORY&nbsp; 06 SCENES</span><span className="workbench-pulse">●&nbsp; READY TO SHAPE</span></div></div>
      <div className="workbench-scene-rail" aria-label="A few storyboard scenes"><div className="rail-scene selected"><i className="rail-image rail-one"/><span>01&nbsp; / &nbsp;THE HOOK</span></div><div className="rail-scene"><i className="rail-image rail-two"/><span>02&nbsp; / &nbsp;THE STORY</span></div><div className="rail-scene"><i className="rail-image rail-three"/><span>03&nbsp; / &nbsp;THE PRODUCT</span></div><span className="rail-more">+03</span></div>
      <form action="/create" method="get" className="workbench-form">
        <label className="workbench-url"><span>START WITH YOUR WEBSITE</span><input name="url" type="text" inputMode="url" autoComplete="url" placeholder="yourwebsite.com" required /></label>
        <div className="workbench-controls">
          <label><span>WHERE WILL YOU SHARE IT?</span><select name="platform" defaultValue="instagram-reels">{outputOptions.map(([label, id]) => <option key={id} value={id}>{label}</option>)}</select></label>
          <label><span>FRAME</span><select name="format" defaultValue="9:16"><option>16:9</option><option>9:16</option><option>4:5</option><option>1:1</option></select></label>
          <label><span>LENGTH</span><select name="duration" defaultValue="30"><option value="15">15 sec</option><option value="20">20 sec</option><option value="30">30 sec</option><option value="45">45 sec</option><option value="60">60 sec</option></select></label>
          <label><span>LANGUAGE</span><select name="language" defaultValue="English"><option>English</option><option>Norsk</option><option>Deutsch</option><option>Français</option><option>Español</option></select></label>
          <label><span>HOW SHOULD IT FEEL?</span><select name="style" defaultValue="Editorial"><option value="Editorial">Thoughtful</option><option value="Cinematic">Film-like</option><option value="Clean">Clear</option><option value="Energetic">Lively</option><option value="Minimal">Quiet</option></select></label>
        </div>
        <button type="submit" className="button workbench-submit">LET’S SHAPE THE STORY <span aria-hidden="true">↗</span></button>
      </form>
      <div className="workbench-footnote"><span>YOUR WEBSITE IS A LOVELY PLACE TO START.</span><span>TRY A SAMPLE OR USE YOUR SITE</span></div>
    </div>
  );
}
