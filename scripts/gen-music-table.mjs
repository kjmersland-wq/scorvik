// Generates src/lib/music/pixabay-library.ts from the table below plus real durations (ffprobe).
import { execFileSync } from "node:child_process";
import fs from "node:fs";

// file | title | artist | genre | subgenre | moods | usage | energy | vocals
const rows = [
  // calm / guide
  ["no-copyright-music-2026-piano-background-music-611657", "Piano Background", "No Copyright Music", "Orchestral", "Piano Solo", ["Calm", "Warm"], "guide", 3, false],
  ["no-copyright-music-2026-corporate-background-611659", "Corporate Background", "No Copyright Music", "Electronic", "Chillout", ["Modern", "Calm"], "guide", 4, false],
  ["kiravale-background-music-for-video-593669", "Background for Video", "Kiravale", "Cinematic", "Inspirational", ["Calm", "Modern"], "guide", 4, false],
  ["gr0za-background-music-background-610368", "Soft Background", "Gr0za", "Electronic", "Ambient", ["Calm", "Modern"], "guide", 3, false],
  ["verclub_music-timelapse-background-609007", "Timelapse Background", "Verclub Music", "Electronic", "Ambient", ["Calm", "Quiet"], "guide", 3, false],
  ["folk_tales-calm-carefree_56sec-610080", "Calm Carefree (56 s)", "Folk Tales", "Acoustic / Folk", "Acoustic", ["Calm", "Warm"], "guide", 3, false],
  ["folk_tales-calm-carefree_22sec-610084", "Calm Carefree (22 s)", "Folk Tales", "Acoustic / Folk", "Acoustic", ["Calm", "Warm"], "guide", 3, false],
  ["folk_tales-calm-carefree_12sec-610085", "Calm Carefree (12 s)", "Folk Tales", "Acoustic / Folk", "Acoustic", ["Calm", "Warm"], "guide", 3, false],
  ["folk_tales-beautiful-beautiful-things_60sec-610064", "Beautiful Things", "Folk Tales", "Acoustic / Folk", "Acoustic", ["Warm", "Calm"], "guide", 3, false],
  ["no-copyright-music-2026-emotional-cello-611670", "Emotional Cello", "No Copyright Music", "Cinematic", "Emotional", ["Emotional", "Calm"], "guide", 3, false],
  ["leberch-film-underscore-254392", "Film Underscore", "Leberch", "Cinematic", "Drama Underscore", ["Cinematic", "Calm"], "guide", 3, false],
  ["smooth-fade-out", "Smooth Fade Out", "Scorvik Library", "Electronic", "Ambient", ["Calm", "Quiet"], "guide", 2, false],
  ["smooth-fade-out-2", "Smooth Fade Out II", "Scorvik Library", "Electronic", "Ambient", ["Calm", "Quiet"], "guide", 2, false],
  // blues
  ["alex-morgan-blues-jazz-coffee-shop-552788", "Blues Jazz Coffee Shop", "Alex Morgan", "Jazz", "Jazz Blues", ["Blues", "Warm"], "guide", 3, false],
  ["alex-morgan-blues-jazz-sunny-cafe-552795", "Blues Jazz Sunny Café", "Alex Morgan", "Jazz", "Jazz Blues", ["Blues", "Warm"], "guide", 3, false],
  ["alex-morgan-blues-jazz-restaurant-552796", "Blues Jazz Restaurant", "Alex Morgan", "Jazz", "Jazz Blues", ["Blues", "Warm"], "ad", 4, false],
  ["alec_koff-blues-ballad-487408", "Blues Ballad", "Alec Koff", "Blues", "Slow Blues", ["Blues", "Calm", "Emotional"], "guide", 3, false],
  ["aurec-blues-587560", "Blues", "Aurec", "Blues", "Chicago Blues", ["Blues", "Authentic"], "ad", 5, false],
  ["shwarzborg-delta-blues-387901", "Delta Blues", "Shwarzborg", "Blues", "Delta Blues", ["Blues", "Authentic"], "ad", 5, false],
  ["nickpanek-blues-rock-instrumental-69-259289", "Blues Rock Instrumental", "Nick Panek", "Blues", "Blues Rock", ["Blues", "Bold"], "ad", 6, false],
  ["nickpanek-cat-on-the-porch-rock-blues-instrumental-275925", "Cat on the Porch", "Nick Panek", "Blues", "Blues Rock", ["Blues", "Warm"], "ad", 5, false],
  ["nickpanek-kansas-blues-blues-rock-instrumental-259874", "Kansas Blues", "Nick Panek", "Blues", "Blues Rock", ["Blues", "Bold"], "ad", 6, false],
  ["tablues", "Tablues", "Scorvik Library", "Blues", "Texas Blues", ["Blues"], "ad", 5, false],
  ["35285074-reconsider-baby-145892", "Reconsider Baby", "Pixabay", "Blues", "Slow Blues", ["Blues", "Emotional"], "ad", 4, true],
  // cinematic / film / ads
  ["alex-morgan-movie-wide-screen-panorama-578501", "Wide Screen Panorama", "Alex Morgan", "Cinematic", "Epic", ["Cinematic", "Emotional"], "ad", 5, false],
  ["leberch-film-594952", "Film", "Leberch", "Cinematic", "Epic", ["Cinematic", "Bold"], "ad", 5, false],
  ["the_mountain-film-591388", "Film", "The Mountain", "Cinematic", "Epic", ["Cinematic", "Adventurous"], "ad", 6, false],
  ["no-copyright-music-2026-inspiring-611650", "Inspiring", "No Copyright Music", "Cinematic", "Inspirational", ["Emotional", "Bright"], "ad", 5, false],
  ["lnplusmusic-motivation-motivation-music-611031", "Motivation", "LN Plus Music", "Cinematic", "Inspirational", ["Energetic", "Bold"], "ad", 7, false],
  // bright / modern / upbeat
  ["lnplusmusic-advertising-advertising-music-610971", "Advertising", "LN Plus Music", "Electronic", "Electropop", ["Bright", "Modern"], "ad", 6, false],
  ["lnplusmusic-product-product-launch-611921", "Product Launch", "LN Plus Music", "Electronic", "Electropop", ["Modern", "Bold"], "ad", 6, false],
  ["lnplusmusic-happy-happy-music-611028", "Happy", "LN Plus Music", "Electronic", "Electropop", ["Playful", "Bright"], "ad", 7, false],
  ["lnplusmusic-event-event-music-611920", "Event", "LN Plus Music", "Electronic", "Electropop", ["Energetic", "Bright"], "ad", 7, false],
  ["no-copyright-music-2026-corporate-611644", "Corporate", "No Copyright Music", "Electronic", "Chillout", ["Modern", "Bold"], "ad", 5, false],
  ["no-copyright-music-2026-corporate-corporate-music-611643", "Corporate Music", "No Copyright Music", "Electronic", "Chillout", ["Modern", "Bright"], "ad", 5, false],
  ["gr0za-upbeat-upbeat-music-610413", "Upbeat", "Gr0za", "Electronic", "Electropop", ["Playful", "Bright"], "ad", 7, false],
  // travel / folk / world
  ["lnplusmusic-travel-travel-music-611925", "Travel", "LN Plus Music", "World", "Tropical", ["Adventurous", "Bright"], "ad", 6, false],
  ["lnplusmusic-indian-indian-music-611803", "Indian", "LN Plus Music", "World", "World Fusion", ["Adventurous", "Warm"], "ad", 5, false],
  ["folk_tales-country-countryside_67sec-610096", "Countryside (67 s)", "Folk Tales", "Acoustic / Folk", "Country", ["Warm", "Authentic"], "ad", 4, false],
  ["folk_tales-country-countryside_51sec-610098", "Countryside (51 s)", "Folk Tales", "Acoustic / Folk", "Country", ["Warm", "Authentic"], "ad", 4, false],
  ["folk_tales-country-countryside_41sec-610099", "Countryside (41 s)", "Folk Tales", "Acoustic / Folk", "Country", ["Warm", "Authentic"], "ad", 4, false],
  // driving / urban
  ["gr0za-racing-racing-music-610347", "Racing", "Gr0za", "Electronic", "Electropop", ["Drive", "Energetic"], "ad", 8, false],
  ["lnplusmusic-car-car-music-611883", "Car", "LN Plus Music", "Electronic", "Electropop", ["Drive", "Energetic"], "ad", 7, false],
  ["lnplusmusic-driving-car-automotive-music-611929", "Driving Automotive", "LN Plus Music", "Electronic", "Electropop", ["Drive", "Bold"], "ad", 7, false],
  ["lnplusmusic-funk-funk-music-611911", "Funk", "LN Plus Music", "Soul / R&B", "Funk", ["Playful", "Bold"], "ad", 7, false],
  ["jonasblakewood-rock-rock-music-611689", "Rock", "Jonas Blakewood", "Rock", "Classic Rock", ["Drive", "Bold"], "ad", 7, false],
  ["jonasblakewood-rock-upbeat-611688", "Rock Upbeat", "Jonas Blakewood", "Rock", "Classic Rock", ["Drive", "Energetic"], "ad", 8, false],
  ["lnplusmusic-rap-rap-beat-611918", "Rap Beat", "LN Plus Music", "Hip-Hop", "Boom Bap", ["Bold", "Energetic"], "ad", 7, false],
  ["gr0za-trap-trap-beat-610220", "Trap Beat", "Gr0za", "Hip-Hop", "Trap", ["Bold", "Energetic"], "ad", 8, false],
  ["no-copyright-music-2026-hip-hop-hip-hop-beat-611663", "Hip-Hop Beat", "No Copyright Music", "Hip-Hop", "Boom Bap", ["Bold", "Modern"], "ad", 7, false],
];

const dir = "public/music";
const entries = rows.map(([file, title, artist, genre, subgenre, moods, usage, energy, vocals]) => {
  const seconds = Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", `${dir}/${file}.mp3`]).toString().trim());
  return { file: `${file}.mp3`, title, artist, genre, subgenre, moods, usage, energy, vocals, duration: Math.round(seconds) };
});

const source = `// Generated by scripts/gen-music-table.mjs: tracks from the owner's Pixabay downloads, re-encoded to 96 kbps.
// Pixabay Content License: free for commercial use, no attribution required.
import type { MusicTrack } from "@/types/project";

interface Row { file: string; title: string; artist: string; genre: string; subgenre: string; moods: string[]; usage: "ad" | "guide"; energy: number; vocals: boolean; duration: number }

const rows: Row[] = ${JSON.stringify(entries, null, 2)};

export const pixabayMusic: MusicTrack[] = rows.map((row): MusicTrack => ({
  id: row.file.replace(/\\.mp3$/, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
  title: row.title,
  artist: row.artist,
  source: "Pixabay Music",
  sourceType: "pixabay",
  sourceUrl: "https://pixabay.com/music/",
  audioUrl: \`/music/\${row.file}\`,
  duration: row.duration,
  genre: row.genre,
  subgenre: row.subgenre,
  style: [row.subgenre],
  mood: row.moods,
  tags: [...row.moods, row.genre, row.subgenre],
  energy: row.energy,
  tempoBpm: null,
  instrumentation: [],
  era: "Contemporary",
  vocals: row.vocals,
  instrumental: !row.vocals,
  useCases: [row.usage === "ad" ? "Ad" : "Guide"],
  usage: row.usage,
  voiceoverSuitable: !row.vocals,
  language: null,
  brandFit: [],
  commercialUse: true,
  metadataStatus: "verified",
  allowedPlatforms: ["youtube", "instagram", "facebook", "tiktok", "square-social"],
  licenseType: "Pixabay Content License (free commercial use)",
  attributionRequired: false,
  licenseUrl: "https://pixabay.com/service/license-summary/",
  downloadedAt: "2026-10-05",
  licenseCheckedAt: "2026-10-07",
}));
`;
fs.writeFileSync("src/lib/music/pixabay-library.ts", source);
console.log(entries.length, "tracks");
