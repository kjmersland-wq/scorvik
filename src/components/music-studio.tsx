"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CreativeBrief, FilmMode, MusicTrack, SiteAnalysis, StoryScene } from "@/types/project";
import { demoMusicCatalog, recommendMusic } from "@/lib/music/recommend";
import { moodChoices, musicTaxonomy } from "@/lib/music/taxonomy";
import { getCopy, type Locale } from "@/lib/i18n/copy";

interface MusicStudioProps {
  analysis: SiteAnalysis;
  brief: CreativeBrief;
  duration: number;
  selectedTrackId: string | null;
  onSelect: (trackId: string | null) => void;
  locale?: Locale;
  mode?: FilmMode;
  scenes?: StoryScene[];
}

function localizeReason(reason: string, locale: Locale): string {
  if (locale !== "no") return reason;
  const rules: Array<[RegExp, (m: RegExpMatchArray) => string]> = [
    [/^(.+) mood matches the brief/, (m) => `Stemningen «${m[1]}» passer til filmens uttrykk`],
    [/^Matches the selected mood/, () => "Passer stemningen du valgte"],
    [/^Genre fits the brand tone/, () => "Sjangeren passer merkevarens tone"],
    [/^(\d+) BPM is close/, (m) => `${m[1]} BPM passer tempoet i filmen`],
    [/^Tags relate to storyboard/, () => "Passer ordene og temaene i storyboardet"],
    [/^Instrumental options/, () => "Instrumental musikk fungerer best under tale"],
    [/^Suitable under voiceover/, () => "Egnet under fortellerstemme"],
    [/^Track length fits/, () => "Lengden passer filmen"],
    [/^(.+) fits the page's feel/, (m) => `Stemningen «${m[1]}» passer sidens uttrykk`],
    [/^(.+) suits this kind of page/, (m) => `${m[1]} passer til denne typen side`],
    [/^Energy matches/, () => "Energien passer filmen"],
    [/^Strong Scorvik Original/, () => "Sterk match med Scorvik Original"],
  ];
  for (const [pattern, build] of rules) { const match = reason.match(pattern); if (match) return build(match); }
  return reason;
}

const tabs = ["Moods", "Recommended", "Genres", "Favorites"] as const;
type Tab = typeof tabs[number];

export function MusicStudio({ analysis, brief, duration, selectedTrackId, onSelect, locale = "en", mode = "advert", scenes }: MusicStudioProps) {
  const text = getCopy(locale).music;
  const [tab, setTab] = useState<Tab>("Moods");
  const [genre, setGenre] = useState("");
  const [moods, setMoods] = useState<string[]>([]);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [versions, setVersions] = useState<Record<string, string>>({});
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const recommendations = useMemo(() => recommendMusic({ analysis, brief, duration, platform: "youtube", mode, userMoods: moods, genrePreference: genre || null, storyboard: scenes ? { scenes } : undefined }), [analysis, brief, duration, mode, moods, genre, scenes]);
  const best = recommendations[0];
  const bestReasons = best ? [...new Set(best.matchReasons.map((reason) => localizeReason(reason, locale)))].slice(0, 3) : [];
  const filteredTracks = recommendations.filter(({ track }) => {
    if (tab === "Favorites" && !favorites.includes(track.id)) return false;
    const search = query.trim().toLowerCase();
    if (search && !`${track.title} ${track.genre} ${track.subgenre} ${track.mood.join(" ")}`.toLowerCase().includes(search)) return false;
    return true;
  });
  const visibleTracks = filteredTracks.map((recommendation) => {
    const allVersions = [recommendation.track, ...recommendation.alternatives];
    const track = allVersions.find((option) => option.id === versions[recommendation.track.id]) ?? recommendation.track;
    return { ...recommendation, track, groupId: recommendation.track.id, allVersions };
  });
  const selected = selectedTrackId ? demoMusicCatalog.find((track) => track.id === selectedTrackId) : undefined;

  useEffect(() => () => audioRef.current?.pause(), []);

  function toggleMood(mood: string) {
    setMoods((current) => current.includes(mood) ? current.filter((item) => item !== mood) : [...current, mood]);
    setTab("Moods");
  }

  function toggleFavorite(track: MusicTrack) {
    setFavorites((current) => current.includes(track.id) ? current.filter((id) => id !== track.id) : [...current, track.id]);
  }

  async function togglePlayback(track: MusicTrack) {
    if (playingId === track.id) {
      audioRef.current?.pause();
      audioRef.current = null;
      setPlayingId(null);
      return;
    }
    audioRef.current?.pause();
    if (!track.audioUrl) return;
    const audio = new Audio(track.audioUrl);
    audioRef.current = audio;
    audio.onended = () => setPlayingId(null);
    setPlayingId(track.id);
    try {
      await audio.play();
    } catch {
      setPlayingId(null);
    }
  }

  function swapVersion(groupId: string, allVersions: MusicTrack[]) {
    if (allVersions.length < 2) return;
    const currentId = versions[groupId] ?? allVersions[0].id;
    const currentIndex = allVersions.findIndex((track) => track.id === currentId);
    const next = allVersions[(currentIndex + 1) % allVersions.length];
    setVersions((current) => ({ ...current, [groupId]: next.id }));
    onSelect(next.id);
  }

  function selectTrack(groupId: string, track: MusicTrack) {
    setVersions((current) => ({ ...current, [groupId]: track.id }));
    onSelect(track.id);
  }

  const tabLabels: Record<Tab, string> = { Moods: text.feel, Recommended: text.recommended, Genres: text.genres, Favorites: text.saved };

  return <div className="music-studio">
    <div className="music-heading"><div><span className="eyebrow">{text.eyebrow}</span><h3>{text.title}</h3><p>{text.description}</p></div><span className="tag">MUSIC / 01</span></div>
    {best && <div className="music-pick" aria-label={text.bestPick}>
      <span className="eyebrow">{text.bestPick}</span>
      <div className="music-pick-main"><button className="track-play" aria-label={`${playingId === best.track.id ? (locale === "no" ? "Sett på pause" : "Pause") : (locale === "no" ? "Spill av" : "Play")} ${best.track.title}`} onClick={() => void togglePlayback(best.track)}><span className={`track-wave ${playingId === best.track.id ? "playing" : ""}`} aria-hidden="true">{[0,1,2,3,4].map((bar) => <i key={bar}/>)}</span></button><span><b>{best.track.title}</b><small>{best.track.genre} · {best.track.mood.slice(0, 2).join(" · ")}</small></span><button className={`choice ${selectedTrackId === best.track.id ? "selected" : ""}`} onClick={() => onSelect(best.track.id)} disabled={selectedTrackId === best.track.id}>{selectedTrackId === best.track.id ? text.picked : text.usePick}</button></div>
      {bestReasons.length > 0 && <ul className="music-pick-reasons">{bestReasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>}
    </div>}
    <div className="music-selected"><span className="music-note" aria-hidden="true">♫</span><span><b>{selected?.title ?? text.noTrack}</b><small>{selected ? `${selected.genre} · ${selected.mood.slice(0, 2).join(" · ")}` : text.chooseMood}</small></span><button className="choice" onClick={() => onSelect(null)} disabled={!selected}>{text.clear}</button></div>
    <div className="music-tabs" role="tablist" aria-label={text.browse}>{tabs.map((item) => <button role="tab" aria-selected={tab === item} className={tab === item ? "active" : ""} onClick={() => setTab(item)} key={item}>{tabLabels[item]}</button>)}</div>
    {tab === "Genres" && <div className="music-filters"><label className="music-select-label">{text.findGenre}<select value={genre} onChange={(event) => setGenre(event.target.value)}><option value="">{text.allGenres}</option>{musicTaxonomy.map((entry) => <optgroup key={entry.genre} label={entry.genre}>{entry.subgenres.map((subgenre) => <option key={subgenre} value={subgenre}>{subgenre}</option>)}</optgroup>)}</select></label><label className="music-search"><span className="sr-only">{text.search}</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={text.findSound} /></label></div>}
    {tab === "Moods" && <div className="mood-choices">{moodChoices.map((mood) => <button key={mood} className={`choice ${moods.includes(mood) ? "selected" : ""}`} aria-pressed={moods.includes(mood)} onClick={() => toggleMood(mood)}>{text.moods[mood as keyof typeof text.moods]}</button>)}</div>}
    {(tab === "Moods" || tab === "Recommended" || tab === "Genres" || tab === "Favorites") && <div className="track-list">{visibleTracks.length ? visibleTracks.slice(0, 5).map(({ track, matchReasons, groupId, allVersions }) => <article className={`track-row ${track.id === selectedTrackId ? "chosen" : ""}`} key={groupId}>
      <button className="track-play" aria-label={`${playingId === track.id ? (locale === "no" ? "Sett på pause" : "Pause") : (locale === "no" ? "Spill av" : "Play")} ${track.title}`} onClick={() => void togglePlayback(track)}><span className={`track-wave ${playingId === track.id ? "playing" : ""}`} aria-hidden="true">{[0,1,2,3,4].map((bar) => <i key={bar}/>)}</span></button>
      <button className="track-select" aria-label={`${locale === "no" ? "Velg" : "Choose"} ${track.title}`} onClick={() => selectTrack(groupId, track)}><b>{track.title}</b><small>{track.mood[0] ?? track.genre} · {track.tempoBpm === null ? (locale === "no" ? "Tempo ikke oppgitt" : "Tempo n/a") : `${track.tempoBpm} BPM`} · {track.usage === "guide" ? text.guide : text.ad}</small><span className="track-reasons">{matchReasons.slice(0, 2).join(" · ")}</span></button>
      {allVersions.length > 1 && <button className="text-link" type="button" onClick={() => swapVersion(groupId, allVersions)}>{text.swapVersion}</button>}
      <span className="track-duration">{Math.floor(track.duration / 60)}:{String(track.duration % 60).padStart(2, "0")}</span><button className={`track-favorite ${favorites.includes(track.id) ? "saved" : ""}`} aria-label={favorites.includes(track.id) ? `${text.saved} ${track.title}` : `${text.saved} ${track.title}`} onClick={() => toggleFavorite(track)}>{favorites.includes(track.id) ? "♥" : "♡"}</button>
      <small className="track-license">{text.royaltyFree}</small>
    </article>) : <p className="music-empty">{recommendations.length === 0 ? text.noLicensedMusic : tab === "Favorites" ? text.nothingSaved : text.nothingFits}</p>}</div>}
  </div>;
}
