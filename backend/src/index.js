import "./lib/loadEnv.js";
import express from "express";
import { clerkMiddleware } from "@clerk/express";
import fileUpload from "express-fileupload";
import path from "path";
import { fileURLToPath } from "url";
import cors from "cors";
import fs from "fs";
import { createServer } from "http";
import cron from "node-cron";
import { emitRealtimeUpdate, initializeWebSocket } from "./lib/realtime.js";
import { connectDB, isDatabaseConnected } from "./lib/db.js";
import userRoutes from "./routes/user.route.js";
import adminRoutes from "./routes/admin.route.js";
import authRoutes from "./routes/auth.route.js";
import songRoutes from "./routes/song.route.js";
import albumRoutes from "./routes/album.route.js";
import statRoutes from "./routes/stat.route.js";
import searchRoutes from "./routes/search.route.js";
import searchHistoryRoutes from "./routes/searchHistory.route.js";
import notificationRoutes from "./routes/notification.route.js";
import friendRoutes from "./routes/friend.route.js";
import chatRoutes from "./routes/chat.route.js";
import healthRoutes from "./routes/health.route.js";
import avatarRoutes from "./routes/avatar.route.js";
import locationRoutes from "./routes/location.route.js";
import playlistRoutes from "./routes/playlist.route.js";
import postRoutes from "./routes/post.route.js";
import saavnRoutes from "./routes/saavn.route.js";
import commentRoutes from "./routes/comment.route.js";
import musicRoutes from "./routes/music.route.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendDistPath = path.resolve(__dirname, "../../frontend/dist");
const app = express();
const PORT = Number(process.env.PORT) || 5002;

const missingRequiredEnv = ["CLERK_SECRET_KEY", "MONGODB_URI"].filter((name) => !process.env[name]?.trim());
if (missingRequiredEnv.length) {
  throw new Error(`Missing required backend environment variables: ${missingRequiredEnv.join(", ")}`);
}

// Configure this only for the number of trusted proxy hops in the deployment.
// Express otherwise uses the socket address for request IPs and rate limits.
if (process.env.TRUST_PROXY_HOPS) {
  const proxyHops = Number(process.env.TRUST_PROXY_HOPS);
  if (Number.isInteger(proxyHops) && proxyHops >= 0 && proxyHops <= 5) app.set("trust proxy", proxyHops);
  else console.error("TRUST_PROXY_HOPS must be an integer between 0 and 5.");
}

const httpServer = createServer(app);
initializeWebSocket(httpServer);

app.disable("x-powered-by");
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(self)");
  if (process.env.NODE_ENV === "production") {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  next();
});

const allowedOrigins = new Set([
  ...(process.env.NODE_ENV === "production"
    ? ["https://beatbond-75ns.onrender.com"]
    : ["http://localhost:3000", "http://localhost:5173", "http://localhost:4173"]),
  process.env.CLIENT_URL,
  process.env.FRONTEND_URL,
].filter(Boolean));

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.has(origin) || (process.env.NODE_ENV !== "production" && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin))) {
      return callback(null, true);
    }
    const error = new Error("Origin is not allowed by CORS");
    error.status = 403;
    return callback(error);
  },
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  credentials: true,
  allowedHeaders: ["Content-Type", "Authorization"]
}));

app.use(express.json({ limit: "256kb", strict: true }));
app.use(express.urlencoded({ extended: false, limit: "64kb", parameterLimit: 100 }));
app.use(clerkMiddleware());
app.use(
  fileUpload({
    useTempFiles: true,
    tempFileDir: path.join(__dirname, "tmp"),
    createParentPath: true,
    limits: {
      // Allows short profile videos while keeping uploads bounded.
      fileSize: 25 * 1024 * 1024,
      files: 2,
      fields: 30,
      parts: 32,
    },
    abortOnLimit: true,
    responseOnLimit: "Upload exceeds the allowed size.",
  })
);

// Announce successful data mutations to connected clients. The event contains
// no record data; each client revalidates through its normal protected API
// calls, which keeps private data private while avoiding manual refreshes.
app.use((req, res, next) => {
  const mutatingMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);
  if (!mutatingMethods.has(req.method) || !req.path.startsWith("/api/")) {
    return next();
  }

  const resource = req.path.split("/").filter(Boolean)[1];
  // Comment writes update the open song-comments cache locally. Broadcasting
  // them as generic mutations would invalidate every active query in every
  // connected tab, creating a large refetch burst after each comment.
  if (resource === "comments") return next();

  res.once("finish", () => {
    if (res.statusCode >= 200 && res.statusCode < 300 && resource) {
      emitRealtimeUpdate({ resource, actorId: req.auth()?.userId ?? null });
    }
  });
  next();
});

// cron jobs
const tempDir = path.join(__dirname, "tmp");
cron.schedule("0 * * * *", () => {
  if (fs.existsSync(tempDir)) {
    fs.readdir(tempDir, (err, files) => {
      if (err) {
        console.error("Temporary upload cleanup failed:", err.message);
        return;
      }
      for (const file of files) {
        fs.unlink(path.join(tempDir, file), (err) => { });
      }
    });
  }
});

app.options('*', cors()); // Enable preflight requests for all routes

// Keep the process available for diagnostics while MongoDB reconnects, but do
// not let database-backed handlers wait for Mongoose's command buffer timeout.
app.use((req, res, next) => {
  // Saavn proxy/mood curation does not read MongoDB. Keeping it available
  // during a transient database reconnect prevents the Mood page from failing
  // even though its upstream music source is healthy.
  if (req.path === "/health" || req.path.startsWith("/api/saavn") || req.path.startsWith("/api/music") || req.path.startsWith("/api/songs/mood/") || isDatabaseConnected()) return next();
  res.status(503).json({
    message: "Database is temporarily unavailable. Please try again shortly.",
  });
});

app.use("/api/users", userRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/songs", songRoutes);
app.use("/api/albums", albumRoutes);
app.use("/api/stats", statRoutes);
app.use("/api/search", searchRoutes);
app.use("/api/search", searchHistoryRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/friends", friendRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/avatars", avatarRoutes);
app.use("/api/locations", locationRoutes);
app.use("/api/playlists", playlistRoutes);
app.use("/api/posts", postRoutes);
app.use("/api/saavn", saavnRoutes);
app.use("/api/music", musicRoutes);
app.use("/api/comments", commentRoutes);
app.use("/health", healthRoutes);

if (process.env.NODE_ENV === "production") {
  app.use(express.static(frontendDistPath, {
    setHeaders: (res, filePath) => {
      const filename = path.basename(filePath);
      if (filename === "index.html" || filename === "sw.js" || filename === "registerSW.js") {
        res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      } else if (filePath.includes(`${path.sep}assets${path.sep}`)) {
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      }
    },
  }));
  app.get("*", (req, res) => {
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.sendFile(path.join(frontendDistPath, "index.html"));
  });
}

// error handler
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  const status = Number.isInteger(err.status) && err.status >= 400 && err.status < 500 ? err.status : 500;
  if (status >= 500) console.error("Request failed:", { method: req.method, path: req.path, status });
  res.status(status).json({
    message: status === 500
      ? "Internal server error"
      : (err.message || "Invalid request"),
  });
});

httpServer.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  void connectDB();
});
