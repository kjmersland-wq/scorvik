export interface MusicTaxonomyEntry {
  genre: string;
  subgenres: string[];
  styles: string[];
  moods: string[];
  energies: string[];
  tempoRange: [number, number];
  instrumentation: string[];
}

export const musicTaxonomy: MusicTaxonomyEntry[] = [
  { genre: "Blues", subgenres: ["Delta Blues", "Chicago Blues", "Texas Blues", "Electric Blues", "Blues Rock", "Soul Blues", "Modern Blues", "Slow Blues", "Blues Shuffle", "Southern Blues"], styles: ["Warm", "Cool", "Gritty", "Vintage", "Modern"], moods: ["Authentic", "Nostalgic", "Powerful", "Relaxed"], energies: ["Slow", "Medium", "Upbeat"], tempoRange: [60, 130], instrumentation: ["Guitar", "Harmonica", "Piano", "Horns", "Full band", "Acoustic"] },
  { genre: "Jazz", subgenres: ["Smooth Jazz", "Cool Jazz", "Jazz Blues", "Lounge Jazz", "Swing", "Contemporary Jazz", "Funk Jazz"], styles: ["Lounge", "Sophisticated", "Smoky", "Modern"], moods: ["Elegant", "Warm", "Relaxed", "Nostalgic"], energies: ["Slow", "Medium", "Upbeat"], tempoRange: [65, 145], instrumentation: ["Piano", "Saxophone", "Trumpet", "Double bass", "Brush drums", "Combo"] },
  { genre: "Rock", subgenres: ["Classic Rock", "Blues Rock", "Indie Rock", "Alternative Rock", "Soft Rock", "Hard Rock", "Southern Rock", "Acoustic Rock"], styles: ["Vintage", "Raw", "Arena", "Acoustic"], moods: ["Powerful", "Adventurous", "Authentic", "Energetic"], energies: ["Medium", "Upbeat", "High"], tempoRange: [75, 160], instrumentation: ["Electric guitar", "Acoustic guitar", "Drums", "Bass", "Full band"] },
  { genre: "Electronic", subgenres: ["Ambient", "Chillout", "Deep House", "Electro", "Synthwave", "Downtempo", "Techno", "Minimal Electronic"], styles: ["Minimal", "Polished", "Retro-futurist", "Organic"], moods: ["Modern", "Confident", "Relaxed", "Cinematic"], energies: ["Low", "Medium", "Upbeat", "High"], tempoRange: [70, 135], instrumentation: ["Synth", "Electronic percussion", "Piano", "Analog textures", "Sub bass"] },
  { genre: "Acoustic / Folk", subgenres: ["Acoustic", "Americana", "Country", "Folk", "Bluegrass", "Singer-Songwriter", "Celtic"], styles: ["Intimate", "Organic", "Story-led", "Roots"], moods: ["Warm", "Authentic", "Nostalgic", "Inspirational"], energies: ["Slow", "Medium", "Upbeat"], tempoRange: [55, 125], instrumentation: ["Acoustic guitar", "Mandolin", "Fiddle", "Piano", "Banjo", "Hand percussion"] },
  { genre: "Cinematic", subgenres: ["Epic", "Emotional", "Inspirational", "Dramatic", "Suspense", "Atmospheric", "Minimal Cinematic"], styles: ["Orchestral", "Textural", "Minimal", "Hybrid"], moods: ["Powerful", "Emotional", "Adventurous", "Inspirational"], energies: ["Low", "Medium", "High"], tempoRange: [50, 145], instrumentation: ["Strings", "Piano", "Brass", "Choir textures", "Percussion", "Synth"] },
  { genre: "Soul / R&B", subgenres: ["Soul", "Motown", "Funk", "Neo-Soul", "R&B", "Gospel-inspired"], styles: ["Vintage", "Smooth", "Groove-led", "Modern"], moods: ["Warm", "Playful", "Confident", "Emotional"], energies: ["Slow", "Medium", "Upbeat"], tempoRange: [60, 130], instrumentation: ["Rhodes", "Horns", "Bass", "Guitar", "Drums", "Claps"] },
  { genre: "World", subgenres: ["Latin", "Reggae", "Afrobeat", "Tropical", "Mediterranean", "Brazilian", "Asian-inspired"], styles: ["Organic", "Rhythmic", "Acoustic", "Contemporary"], moods: ["Adventurous", "Playful", "Warm", "Energetic"], energies: ["Slow", "Medium", "Upbeat", "High"], tempoRange: [65, 140], instrumentation: ["Hand percussion", "Guitar", "Brass", "Marimba", "Strings", "Flute"] },
  { genre: "Orchestral", subgenres: ["Chamber", "Modern Classical", "Piano Solo", "String Ensemble", "Baroque-inspired"], styles: ["Refined", "Minimal", "Expressive"], moods: ["Elegant", "Emotional", "Sophisticated", "Inspirational"], energies: ["Slow", "Medium"], tempoRange: [45, 120], instrumentation: ["Piano", "Strings", "Cello", "Woodwinds"] },
];

export const moodChoices = ["Warm", "Bold", "Calm", "Energetic", "Cinematic", "Playful", "Elegant", "Emotional", "Modern", "Nostalgic", "Adventurous", "Authentic"];

export function findTaxonomyEntry(genre: string, subgenre?: string): MusicTaxonomyEntry | undefined {
  return musicTaxonomy.find((entry) => entry.genre === genre && (!subgenre || entry.subgenres.includes(subgenre)));
}
