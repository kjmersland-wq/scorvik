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

const tabs = ["Recommended", "Genres", "Moods", "Favorites"] as const;
type Tab = typeof tabs[number];

export function MusicStudio({ analysis, brief, duration, selectedTrackId, onSelect }: MusicStudioProps) {
  const [tab, setTab] = useState<Tab>("Recommended");
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
    <div className="music-heading"><div><span className="eyebrow">Soundtrack direction</span><h3>Find the feeling.</h3><p>Recommendations follow your brand direction. Choose a mood or explore genres.</p></div><span className="tag">SOUND / 01</span></div>
    <div className="music-selected"><span className="music-note" aria-hidden="true">♫</span><span><b>{selected?.title ?? "No track selected"}</b><small>{selected ? `${selected.subgenre} · ${selected.mood.slice(0, 2).join(" · ")} · ${selected.tempoBpm} BPM` : "Choose a direction below"}</small></span><button className="choice" onClick={() => onSelect(null)} disabled={!selected}>Clear</button></div>
    <div className="music-tabs" role="tablist" aria-label="Browse music">{tabs.map((item) => <button role="tab" aria-selected={tab === item} className={tab === item ? "active" : ""} onClick={() => setTab(item)} key={item}>{item}</button>)}</div>
    {tab === "Genres" && <div className="music-filters"><label className="music-select-label">Genre<select value={genre} onChange={(event) => setGenre(event.target.value)}><option value="">Recommended mix</option>{musicTaxonomy.map((entry) => <optgroup key={entry.genre} label={entry.genre}>{entry.subgenres.map((subgenre) => <option key={subgenre} value={subgenre}>{subgenre}</option>)}</optgroup>)}</select></label><label className="music-search"><span className="sr-only">Search genres, tracks, or moods</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search the catalog" /></label></div>}
    {tab === "Moods" && <div className="mood-choices">{moodChoices.map((mood) => <button key={mood} className={`choice ${moods.includes(mood) ? "selected" : ""}`} aria-pressed={moods.includes(mood)} onClick={() => toggleMood(mood)}>{mood}</button>)}</div>}
    {(tab === "Recommended" || tab === "Genres" || tab === "Favorites") && <div className="track-list">{filteredTracks.length ? filteredTracks.slice(0, 5).map(({ track, matchReasons }) => <article className={`track-row ${track.id === selectedTrackId ? "chosen" : ""}`} key={track.id}>
      <button className="track-play" aria-label={`${playingId === track.id ? "Pause" : "Preview"} ${track.title}`} onClick={() => setPlayingId((current) => current === track.id ? null : track.id)}><span className={`track-wave ${playingId === track.id ? "playing" : ""}`} aria-hidden="true">{[0,1,2,3,4].map((bar) => <i key={bar}/>)}</span></button>
      <button className="track-select" onClick={() => onSelect(track.id)}><b>{track.title}</b><small>{track.subgenre} · {track.mood.slice(0, 2).join(" · ")} · {track.tempoBpm} BPM</small><span className="track-reasons">{matchReasons.slice(0, 2).join(" · ") || track.genre}</span></button>
      <span className="track-duration">{Math.floor(track.duration / 60)}:{String(track.duration % 60).padStart(2, "0")}</span><button className={`track-favorite ${favorites.includes(track.id) ? "saved" : ""}`} aria-label={`${favorites.includes(track.id) ? "Remove" : "Add"} ${track.title} ${favorites.includes(track.id) ? "from" : "to"} favorites`} onClick={() => toggleFavorite(track)}>{favorites.includes(track.id) ? "♥" : "♡"}</button>
      <small className="track-license">{track.commercialUse && track.licenseUrl ? "LICENSE METADATA" : "DEMO ONLY · NO AUDIO OR USAGE RIGHTS"}</small>
    </article>) : <p className="music-empty">No saved favorites in this browser yet.</p>}</div>}
    <p className="music-disclosure">Track names demonstrate the matching system only. No audio files or commercial-use rights are provided in demo mode.</p>
  </div>;
}
