const splitOrigins = (...values) => values
  .flatMap((value) => typeof value === "string" ? value.split(",") : [])
  .map((value) => value.trim().replace(/\/$/, ""))
  .filter(Boolean);

export const getAllowedOrigins = () => new Set([
  "https://beatbond-75ns.onrender.com",
  ...splitOrigins(process.env.CLIENT_URL, process.env.FRONTEND_URL, process.env.ALLOWED_ORIGINS),
  ...(process.env.NODE_ENV === "production" ? [] : ["http://localhost:3000", "http://localhost:5173", "http://localhost:4173"]),
]);

export const isAllowedOrigin = (origin) => {
  if (!origin) return true;
  if (getAllowedOrigins().has(origin.replace(/\/$/, ""))) return true;
  return process.env.NODE_ENV !== "production" && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
};

