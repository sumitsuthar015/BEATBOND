import { randomUUID } from "node:crypto";
import { logEvent, routeLabel } from "../lib/logger.js";

export const requestContext = (req, res, next) => {
  const requestId = randomUUID();
  const startedAt = process.hrtime.bigint();
  req.requestId = requestId;
  res.setHeader("X-Request-Id", requestId);
  res.once("finish", () => {
    // Successful CORS preflights and cache validators are routine browser
    // traffic. Keep failures visible, but omit these high-volume success logs.
    if ((req.method === "OPTIONS" && res.statusCode < 400) || res.statusCode === 304) return;
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    logEvent("info", "http.request.completed", {
      requestId,
      method: req.method,
      route: routeLabel(req),
      statusCode: res.statusCode,
      durationMs: Math.round(durationMs * 100) / 100,
    });
  });
  next();
};

