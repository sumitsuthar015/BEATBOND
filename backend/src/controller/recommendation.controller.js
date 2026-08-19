import { getRecommendations } from "../services/recommendation.service.js";

export const getSongRecommendations = async (req, res, next) => {
  try {
    const songId = String(req.params.songId || "").trim();
    if (!songId || songId.length > 200) return res.status(400).json({ message: "A valid song id is required" });
    const data = await getRecommendations({ songId, source: req.query, userId: req.auth?.userId, limit: req.query.limit });
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
};
