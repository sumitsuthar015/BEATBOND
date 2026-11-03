import { FeatureFlag } from "../models/featureFlag.model.js";
import { readFeatureRollouts } from "../lib/featureFlags.js";

const FLAG_NAME = /^[a-z][a-z0-9_]{1,63}$/;

export const listFeatureFlags = async (_req, res, next) => {
  try {
    const configured = readFeatureRollouts();
    const saved = await FeatureFlag.find().select("name enabled updatedBy updatedAt").lean();
    const savedByName = new Map(saved.map((flag) => [flag.name, flag]));
    const names = new Set([...Object.keys(configured), ...savedByName.keys()]);
    const flags = [...names].sort().map((name) => {
      const setting = configured[name];
      const override = savedByName.get(name);
      const rolloutPercent = setting === true ? 100 : Math.max(0, Math.min(100, Number(setting?.rolloutPercent ?? (setting?.enabled ? 100 : 0)) || 0));
      return {
        name,
        enabled: typeof override?.enabled === "boolean" ? override.enabled : Boolean(setting === true || (setting?.enabled === true && rolloutPercent > 0)),
        rolloutPercent,
        source: override ? "admin" : "environment",
        updatedAt: override?.updatedAt ?? null,
      };
    });
    return res.json({ flags });
  } catch (error) {
    return next(error);
  }
};

export const updateFeatureFlag = async (req, res, next) => {
  const name = typeof req.params?.name === "string" ? req.params.name : "";
  const body = req.body;
  if (!FLAG_NAME.test(name)) return res.status(400).json({ message: "Feature flag name is invalid." });
  if (!body || typeof body !== "object" || Array.isArray(body)
    || Object.keys(body).length !== 1 || typeof body.enabled !== "boolean") {
    return res.status(400).json({ message: "Provide only an enabled boolean." });
  }

  try {
    const flag = await FeatureFlag.findOneAndUpdate(
      { name },
      { $set: { enabled: body.enabled, updatedBy: req.auth().userId }, $setOnInsert: { name } },
      { upsert: true, new: true, runValidators: true },
    ).select("name enabled updatedBy updatedAt").lean();
    return res.json({ flag: { ...flag, source: "admin", rolloutPercent: flag.enabled ? 100 : 0 } });
  } catch (error) {
    return next(error);
  }
};

export const resetFeatureFlag = async (req, res, next) => {
  const name = typeof req.params?.name === "string" ? req.params.name : "";
  if (!FLAG_NAME.test(name)) return res.status(400).json({ message: "Feature flag name is invalid." });
  try {
    await FeatureFlag.deleteOne({ name });
    return res.json({ flag: { name, source: "environment" } });
  } catch (error) {
    return next(error);
  }
};

