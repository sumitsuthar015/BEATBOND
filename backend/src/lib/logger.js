const METHODS = new Set(["log", "info", "warn", "error"]);

export const formatLogEntry = (event, fields = {}, now = new Date()) => ({
  timestamp: now.toISOString(),
  event,
  ...fields,
});

export const routeLabel = (req) => {
  if (req.route?.path) return `${req.baseUrl || ""}${req.route.path}`;
  if (req.path === "/health") return "/health";
  if (req.path?.startsWith("/api/")) return "/api/<unmatched>";
  return "/<static-or-unmatched>";
};

export const logEvent = (level, event, fields = {}) => {
  const method = METHODS.has(level) ? level : "info";
  try {
    console[method](JSON.stringify(formatLogEntry(event, fields)));
  } catch {
    // Observability must never break a request or background task.
  }
};

