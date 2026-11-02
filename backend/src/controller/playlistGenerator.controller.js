import { Groq } from "groq-sdk";
import { searchSongs } from "../services/saavn.service.js";

const models = [...new Set([process.env.GROQ_CHAT_MODEL, "openai/gpt-oss-120b", "qwen/qwen3.8-27b"].filter(Boolean))];

export const generatePlaylist = async (req, res, next) => {
  const prompt = typeof req.body?.prompt === "string" ? req.body.prompt.trim() : "";
  if (prompt.length < 8 || prompt.length > 300) return res.status(400).json({ message: "Describe your playlist in 8 to 300 characters." });
  if (req.body?.thirdPartyConsent !== true) return res.status(400).json({ message: "Accept the AI provider notice before generating a playlist." });
  if (!process.env.GROQ_API_KEY) return res.status(503).json({ message: "AI playlist generation is not configured yet." });
  try {
    const candidateResponse = await searchSongs(prompt, 50);
    const candidates = (candidateResponse?.data?.results || []).filter((song) => song?.id && song?.name && song?.downloadUrl?.length).slice(0, 50);
    if (!candidates.length) return res.status(404).json({ message: "No playable songs matched that vibe. Try a different description." });
    const catalog = candidates.map((song, index) => ({ id: String(song.id), title: song.name, artist: song.artists?.primary?.map((artist) => artist.name).join(", ") || "Unknown artist", language: song.language || "Unknown", index }));
    const client = new Groq({ apiKey: process.env.GROQ_API_KEY });
    let completion;
    for (const model of models) {
      try {
        completion = await client.chat.completions.create({
          model,
          temperature: 0.4,
          max_tokens: 700,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: "Build a music playlist from only the supplied catalog. Return JSON with one property: songIds, an ordered array of 8 to 15 exact catalog IDs. Never invent IDs. Match the requested mood, era, language, and context." },
            { role: "user", content: JSON.stringify({ requestedVibe: prompt, catalog }) },
          ],
        });
        break;
      } catch (error) {
        if (!(error.status === 404 || error.error?.error?.code === "model_not_found") || model === models.at(-1)) throw error;
      }
    }
    const parsed = JSON.parse(completion?.choices?.[0]?.message?.content || "{}");
    const byId = new Map(candidates.map((song) => [String(song.id), song]));
    const selected = Array.isArray(parsed.songIds) ? [...new Set(parsed.songIds.filter((id) => typeof id === "string" && byId.has(id)))].slice(0, 15).map((id) => byId.get(id)) : [];
    res.json({ name: `Vibe: ${prompt.slice(0, 64)}`, description: `AI-picked songs for: ${prompt}`, songs: selected });
  } catch (error) {
    console.error("AI playlist generation failed:", error);
    next(error);
  }
};
