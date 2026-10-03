"use client";

import { useMemo, useState } from "react";
import type { CreativeBrief, MusicTrack, SiteAnalysis } from "@/types/project";
import { demoMusicCatalog, recommendMusic } from "@/lib/music/recommend";
import { moodChoices, musicTaxonomy } from "@/lib/music/taxonomy";

interface MusicStudioProps {
  analysis: SiteAnalysis;
  brief: CreativeBrief;
  duration: number;
  selectedTrackId: string | null;
  onSelect: (trackId: string | null) => void;
}

const tabs = ["Moods", "Recommended", "Genres", "Favorites"] as const;
type Tab = typeof tabs[number];
const tabLabels: Record<Tab, string> = { Moods: "Feel", Recommended: "For your story", Genres: "Genres", Favorites: "Saved" };

export function MusicStudio({ analysis, brief, duration, selectedTrackId, onSelect }: MusicStudioProps) {
  const [tab, setTab] = useState<Tab>("Moods");
  const [genre, setGenre] = useState("");
  const [moods, setMoods] = useState<string[]>([]);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const recommendations = useMemo(() => recommendMusic({ analysis, brief, duration, platform: "youtube", userMoods: moods, genrePreference: genre || null }), [analysis, brief, duration, moods, genre]);
  const filteredTracks = recommendations.filter(({ track }) => {
    if (tab === "Favorites" && !favorites.includes(track.id)) return false;
    const search = query.trim().toLowerCase();
    if (search && !`${track.title} ${track.genre} ${track.subgenre} ${track.mood.join(" ")}`.toLowerCase().includes(search)) return false;
    return true;
  });
  const selected = selectedTrackId ? demoMusicCatalog.find((track) => track.id === selectedTrackId) : undefined;

  function toggleMood(mood: string) {
    setMoods((current) => current.includes(mood) ? current.filter((item) => item !== mood) : [...current, mood]);
    setTab("Moods");
  }

  function toggleFavorite(track: MusicTrack) {
    setFavorites((current) => current.includes(track.id) ? current.filter((id) => id !== track.id) : [...current, track.id]);
  }

  return <div className="music-studio">
    <div className="music-heading"><div><span className="eyebrow">A soundtrack for your story</span><h3>How do you want it to feel?</h3><p>Start with a feeling. We’ll find a few sounds that fit.</p></div><span className="tag">MUSIC / 01</span></div>
    <div className="music-selected"><span className="music-note" aria-hidden="true">♫</span><span><b>{selected?.title ?? "No sound chosen yet"}</b><small>{selected ? `${selected.genre} · ${selected.mood.slice(0, 2).join(" · ")}` : "Choose a feeling to get started"}</small></span><button className="choice" onClick={() => onSelect(null)} disabled={!selected}>Clear</button></div>
    <div className="music-tabs" role="tablist" aria-label="Browse music by feeling or sound">{tabs.map((item) => <button role="tab" aria-selected={tab === item} className={tab === item ? "active" : ""} onClick={() => setTab(item)} key={item}>{tabLabels[item]}</button>)}</div>
    {tab === "Genres" && <div className="music-filters"><label className="music-select-label">Find a genre<select value={genre} onChange={(event) => setGenre(event.target.value)}><option value="">A little of everything</option>{musicTaxonomy.map((entry) => <optgroup key={entry.genre} label={entry.genre}>{entry.subgenres.map((subgenre) => <option key={subgenre} value={subgenre}>{subgenre}</option>)}</optgroup>)}</select></label><label className="music-search"><span className="sr-only">Search sounds, genres, or moods</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a sound" /></label></div>}
    {tab === "Moods" && <div className="mood-choices">{moodChoices.map((mood) => <button key={mood} className={`choice ${moods.includes(mood) ? "selected" : ""}`} aria-pressed={moods.includes(mood)} onClick={() => toggleMood(mood)}>{mood}</button>)}</div>}
    {(tab === "Moods" || tab === "Recommended" || tab === "Genres" || tab === "Favorites") && <div className="track-list">{filteredTracks.length ? filteredTracks.slice(0, 5).map(({ track, matchReasons }) => <article className={`track-row ${track.id === selectedTrackId ? "chosen" : ""}`} key={track.id}>
      <button className="track-play" aria-label={`${playingId === track.id ? "Pause visual preview for" : "Show visual preview for"} ${track.title}`} onClick={() => setPlayingId((current) => current === track.id ? null : track.id)}><span className={`track-wave ${playingId === track.id ? "playing" : ""}`} aria-hidden="true">{[0,1,2,3,4].map((bar) => <i key={bar}/>)}</span></button>
      <button className="track-select" aria-label={`Choose ${track.title} for your film`} onClick={() => onSelect(track.id)}><b>{track.title}</b><small>{track.genre} · {track.mood.slice(0, 2).join(" · ")}</small><span className="track-reasons">{matchReasons.slice(0, 2).join(" · ") || "A sound to explore"}</span></button>
      <span className="track-duration">{Math.floor(track.duration / 60)}:{String(track.duration % 60).padStart(2, "0")}</span><button className={`track-favorite ${favorites.includes(track.id) ? "saved" : ""}`} aria-label={favorites.includes(track.id) ? `Remove ${track.title} from saved tracks` : `Save ${track.title} for later`} onClick={() => toggleFavorite(track)}>{favorites.includes(track.id) ? "♥" : "♡"}</button>
      <small className="track-license">{track.commercialUse && track.licenseUrl ? "Check usage permission" : "Sample details · no audio file"}</small>
    </article>) : <p className="music-empty">{tab === "Favorites" ? "Nothing saved just yet. Save a track and it will be waiting here." : "Nothing quite fits yet. Try another feeling or browse genres."}</p>}</div>}
    <p className="music-disclosure">These are sample track details. This demo doesn’t include music files or permission to use them in a finished film.</p>
  </div>;
}
