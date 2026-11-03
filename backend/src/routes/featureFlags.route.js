import { Router } from "express";
import { protectRoute } from "../middleware/auth.middleware.js";
import { rateLimit } from "../middleware/rateLimit.middleware.js";
import { getFeatureFlagsForUser } from "../lib/featureFlags.js";
import { FeatureFlag } from "../models/featureFlag.model.js";

const router = Router();

router.get("/", protectRoute, rateLimit({ name: "feature-flags", limit: 60, windowMs: 60 * 60 * 1000 }), async (req, res, next) => {
  try {
    const records = await FeatureFlag.find().select("name enabled").lean();
    const overrides = Object.fromEntries(records.map(({ name, enabled }) => [name, enabled]));
    const flags = getFeatureFlagsForUser(req.auth().userId, undefined, overrides);
    res.setHeader("Cache-Control", "private, no-store");
    return res.json({ flags });
  } catch (error) {
    return next(error);
  }
});

export default router;

