import { ListeningActivity } from "../models/listeningActivity.model.js";

const startOfRange = (range, now = new Date()) => {
  if (range === "year") return new Date(now.getFullYear(), 0, 1);
  return new Date(now.getFullYear(), now.getMonth(), 1);
};

export const getMyWrapped = async (req, res, next) => {
  try {
    const range = req.query.range === "year" ? "year" : "month";
    const since = startOfRange(range);
    const plays = await ListeningActivity.find({ userId: req.auth().userId, playedAt: { $gte: since } })
      .sort({ playedAt: -1 }).limit(10_000)
      .select("songId title artist imageUrl genre durationPlayed completed skipped playedAt")
      .lean();
    const songs = new Map();
    const artists = new Map();
    const genres = new Map();
    let seconds = 0;
    for (const play of plays) {
      seconds += Math.max(0, Number(play.durationPlayed) || 0);
      const songKey = String(play.songId || `${play.title}|${play.artist}`);
      const song = songs.get(songKey) || { songId: songKey, title: play.title, artist: play.artist, imageUrl: play.imageUrl || "", plays: 0, completed: 0 };
      song.plays += 1;
      if (play.completed) song.completed += 1;
      songs.set(songKey, song);
      const artist = String(play.artist || "Unknown artist").split(/,|&| feat\.? | ft\.? /i)[0].trim() || "Unknown artist";
      artists.set(artist, (artists.get(artist) || 0) + 1);
      const genre = String(play.genre || "Unknown").trim() || "Unknown";
      genres.set(genre, (genres.get(genre) || 0) + 1);
    }
    const top = (map, count = 5) => [...map].sort((first, second) => second[1] - first[1]).slice(0, count);
    res.json({
      range,
      label: range === "year" ? String(new Date().getFullYear()) : new Date().toLocaleString("en", { month: "long", year: "numeric" }),
      totalPlays: plays.length,
      minutesListened: Math.round(seconds / 60),
      completedTracks: plays.filter((play) => play.completed).length,
      topSongs: [...songs.values()].sort((first, second) => second.plays - first.plays).slice(0, 5),
      topArtists: top(artists).map(([name, count]) => ({ name, plays: count })),
      topGenres: top(genres).map(([name, count]) => ({ name, plays: count })),
    });
  } catch (error) { next(error); }
};
