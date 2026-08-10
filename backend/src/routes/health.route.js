import { Router } from "express";
import { isDatabaseConnected } from "../lib/db.js";
const router = Router();

router.get("/", (req, res) => {
  const databaseConnected = isDatabaseConnected();
  res.status(databaseConnected ? 200 : 503).json({
    status: databaseConnected ? "ok" : "degraded",
    database: databaseConnected ? "connected" : "disconnected",
  });
});

export default router;
