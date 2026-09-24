import type { Song } from "@/types";
import { readListeningHistory, type ListeningEvent } from "@/lib/listeningHistory";
import { getSignals, type PlaybackSignal } from "@/lib/recommendations";

export type DetectedMoodId = "happy" | "sad" | "romantic" | "party";

export type MoodDetection = {
  mood: DetectedMoodId;
  /** "high" and "medium" come from what the listener played; "low" is a time-of-day guess. */
  confidence: "high" | "medium" | "low";
  reasons: string[];
};

const MOODS: DetectedMoodId[] = ["happy", "sad", "romantic", "party"];

// Words that give a song's mood away in its title or album. They follow the
// backend's mood playlists (mood.service.js) so detection and the playlist
// that gets played agree on what "romantic" or "party" means.
const MOOD_WORDS: Record<DetectedMoodId, string[]> = {
  happy: ["happy", "smile", "sunshine", "joy", "khushi", "zindagi", "good day", "feel good", "celebrate", "masti"],
  sad: ["sad", "judai", "tanha", "dard", "yaad", "breakup", "broken", "alone", "akela", "tears", "bewafa", "rona", "emotional", "pain"],
  romantic: ["love", "ishq", "pyaar", "pyar", "mohabbat", "romantic", "saath", "jaan", "sanam", "humsafar", "dil", "tum hi", "kesariya", "raabta"],
  party: ["dance", "party", "club", "dhol", "bhangra", "nach", "naach", "dj", "anthem", "disco", "remix", "beat"],
};

const LABELS: Record<DetectedMoodId, string> = { happy: "happy", sad: "sad", romantic: "romantic", party: "party" };
const RECENT_WINDOW_MS = 3 * 60 * 60 * 1000;
const MAX_RECENT = 20;

const normalise = (value: string) =>
  ` ${value.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim()} `;

/** Which moods a song's title and album point to (usually zero or one). */
export const moodsOfSong = (song: Pick<Song, "title"> & Partial<Pick<Song, "albumName" | "albumTitle">>): DetectedMoodId[] => {
  const text = normalise(`${song.title} ${song.albumName || song.albumTitle || ""}`);
  // Whole words only: "tum" must not match inside "tumhe", "dil" not inside "dildaar".
  return MOODS.filter((mood) => MOOD_WORDS[mood].some((word) => text.includes(` ${word} `)));
};

/** A gentle prior from the clock: mornings lean happy, late nights romantic or sad. */
export const timeOfDayPrior = (now: Date): { scores: Partial<Record<DetectedMoodId, number>>; reason: string } => {
  const hour = now.getHours();
  const weekendNight = (now.getDay() === 5 || now.getDay() === 6) && (hour >= 19 || hour < 2);
  if (weekendNight) return { scores: { party: 1, romantic: 0.4 }, reason: "It's a weekend night" };
  if (hour >= 5 && hour < 11) return { scores: { happy: 1 }, reason: "It's morning" };
  if (hour >= 11 && hour < 17) return { scores: { happy: 0.6, party: 0.3 }, reason: "It's the middle of the day" };
  if (hour >= 17 && hour < 21) return { scores: { romantic: 0.6, happy: 0.4, party: 0.3 }, reason: "It's evening" };
  if (hour >= 21 || hour < 2) return { scores: { romantic: 1, sad: 0.5 }, reason: "It's late at night" };
  return { scores: { sad: 1, romantic: 0.5 }, reason: "It's the early hours" };
};

type DetectInput = {
  plays: ListeningEvent[];
  signals: PlaybackSignal[];
  currentSong?: Song | null;
  now?: Date;
};

/**
 * Works out the listener's likely mood from what they played in the last few
 * hours (recent and fully played songs count more, skipped ones less), the
 * song playing now, and the time of day.
 */
export const detectMood = ({ plays, signals, currentSong, now = new Date() }: DetectInput): MoodDetection => {
  const prior = timeOfDayPrior(now);
  const evidence: Record<DetectedMoodId, number> = { happy: 0, sad: 0, romantic: 0, party: 0 };
  const examples: Record<DetectedMoodId, string[]> = { happy: [], sad: [], romantic: [], party: [] };
  const outcome = new Map(signals.map((signal) => [signal.songId, signal]));

  const recent = plays
    .filter((play) => now.getTime() - new Date(play.playedAt).getTime() <= RECENT_WINDOW_MS)
    .slice(-MAX_RECENT)
    .reverse();
  const listened = currentSong ? [{ song: currentSong, weight: 1.5 }] : [];
  recent.forEach((play, index) => {
    const signal = outcome.get(play._id);
    const feedback = signal?.completed ? 1 : signal?.skipped ? 0.3 : 0.8;
    listened.push({ song: play, weight: (1 - index / (MAX_RECENT * 2)) * feedback });
  });

  const seen = new Set<string>();
  for (const { song, weight } of listened) {
    if (seen.has(song._id)) continue;
    seen.add(song._id);
    for (const mood of moodsOfSong(song)) {
      evidence[mood] += weight;
      if (examples[mood].length < 2) examples[mood].push(song.title.replace(/\s*\(.*$/, ""));
    }
  }

  const score = (mood: DetectedMoodId) => (prior.scores[mood] || 0) + 1.5 * evidence[mood];
  const mood = [...MOODS].sort((a, b) => score(b) - score(a))[0];
  const totalEvidence = MOODS.reduce((sum, key) => sum + evidence[key], 0);
  const confidence: MoodDetection["confidence"] =
    evidence[mood] >= 2 && evidence[mood] >= totalEvidence * 0.5 ? "high" : evidence[mood] >= 0.8 ? "medium" : "low";

  const reasons: string[] = [];
  if (evidence[mood] > 0) {
    const count = listened.filter(({ song }) => moodsOfSong(song).includes(mood)).length;
    reasons.push(`${count} recent ${count === 1 ? "song sounds" : "songs sound"} ${LABELS[mood]} (${examples[mood].join(", ")})`);
  }
  if (prior.scores[mood]) reasons.push(prior.reason);
  if (!recent.length && !currentSong) reasons.push("Play a few songs and this gets more accurate");

  return { mood, confidence, reasons };
};

/** Detects the mood of whoever is signed in on this device. */
export const detectCurrentMood = (currentSong?: Song | null): MoodDetection => {
  const userId = localStorage.getItem("beatbond:active-listener");
  return detectMood({
    plays: userId ? readListeningHistory(userId) : [],
    signals: userId ? getSignals(userId) : [],
    currentSong,
  });
};
