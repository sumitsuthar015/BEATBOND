import { Avatar } from "../models/avatar.model.js";

const ALLOWED_OPTIONS = new Set(["skinColor", "hair", "hairColor", "eyes", "eyebrows", "mouth", "facialHair", "glasses", "accessories", "clothing", "clothingColor", "shoes", "hat", "jewelry", "backgroundColor"]);

export const getMyAvatar = async (req, res, next) => {
  try { res.json(await Avatar.findOne({ userId: req.auth.userId }).lean()); } catch (error) { next(error); }
};

export const saveMyAvatar = async (req, res, next) => {
  try {
    const { gender, options } = req.body;
    if (!["male", "female"].includes(gender)) return res.status(400).json({ message: "Invalid avatar base" });
    if (!options || typeof options !== "object" || Array.isArray(options)) return res.status(400).json({ message: "Invalid avatar options" });
    const safeOptions = Object.fromEntries(Object.entries(options)
      .filter(([key, value]) => ALLOWED_OPTIONS.has(key) && typeof value === "string" && value.length <= 80));
    const avatar = await Avatar.findOneAndUpdate({ userId: req.auth.userId }, { gender, options: safeOptions }, { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true });
    res.json(avatar);
  } catch (error) { next(error); }
};
