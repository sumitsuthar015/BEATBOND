import { Router } from "express";
import { rateLimit } from "../middleware/rateLimit.middleware.js";
import { runHealthChecks } from "../lib/healthChecks.js";
const router = Router();

let cachedHealth = null;
let cachedAt = 0;
let pendingCheck = null;

router.get("/", rateLimit({ name: "health-check", limit: 60, windowMs: 60 * 1000 }), async (req, res, next) => {
  try {
    if (!cachedHealth || Date.now() - cachedAt > 15_000) {
      pendingCheck ??= runHealthChecks().then((result) => {
        cachedHealth = result;
        cachedAt = Date.now();
        return result;
      }).finally(() => { pendingCheck = null; });
      cachedHealth = await pendingCheck;
    }
    res.setHeader("Cache-Control", "no-store");
    res.status(cachedHealth.status === "ok" ? 200 : 503).json(cachedHealth);
  } catch (error) {
    next(error);
  }
});

export default router;
