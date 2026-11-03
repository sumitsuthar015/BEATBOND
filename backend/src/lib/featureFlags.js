import { createHash } from "node:crypto";

export const readFeatureRollouts = (value = process.env.FEATURE_FLAG_ROLLOUTS) => {
  if (!value?.trim()) return {};
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed;
  } catch {
    console.error("FEATURE_FLAG_ROLLOUTS must be a JSON object; feature flags are disabled.");
    return {};
  }
};

const rolloutBucket = (userId, flag) => {
  const hash = createHash("sha256").update(`${flag}:${userId}`).digest();
  return hash.readUInt32BE(0) % 100;
};

export const isFeatureEnabledForUser = (flag, userId, rollouts = readFeatureRollouts()) => {
  if (typeof flag !== "string" || !flag || typeof userId !== "string" || !userId) return false;
  const setting = rollouts[flag];
  if (setting === true) return true;
  if (!setting || typeof setting !== "object" || setting.enabled !== true) return false;
  const percentage = Number(setting.rolloutPercent ?? 100);
  if (!Number.isFinite(percentage) || percentage <= 0) return false;
  if (percentage >= 100) return true;
  return rolloutBucket(userId, flag) < percentage;
};

export const getFeatureFlagsForUser = (userId, rollouts = readFeatureRollouts(), overrides = {}) => {
  const names = new Set([...Object.keys(rollouts), ...Object.keys(overrides)]);
  return Object.fromEntries([...names].map((flag) => [
    flag,
    typeof overrides[flag] === "boolean" ? overrides[flag] : isFeatureEnabledForUser(flag, userId, rollouts),
  ]));
};

