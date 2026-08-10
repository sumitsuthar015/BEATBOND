import express from "express";
import dotenv from "dotenv";
import { clerkMiddleware } from "@clerk/express"; 
import fileUpload from "express-fileupload";
import path from "path";
import { fileURLToPath } from "url";
import cors from "cors";
import fs from "fs";
import { createServer } from "http";
import cron from "node-cron";

import { initializeSocket } from "./lib/socket.js";

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

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendDistPath = path.resolve(__dirname, "../../frontend/dist");
const app = express();
const PORT = Number(process.env.PORT) || 5002;

const httpServer = createServer(app);
initializeSocket(httpServer);

const allowedOrigins = [
  "http://localhost:3000",
  "http://localhost:5173",
  "http://localhost:4173",
  "https://spotify-hdw7.onrender.com",
  process.env.CLIENT_URL,
  process.env.FRONTEND_URL,
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin) || process.env.NODE_ENV !== "production") {
      return callback(null, true);
    }
    // Allow deployed custom domains while preserving credentials
    return callback(null, true);
  },
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  credentials: true,
  allowedHeaders: ["Content-Type", "Authorization"]
}));

app.use(express.json());
app.use(clerkMiddleware());
app.use(
  fileUpload({
    useTempFiles: true,
    tempFileDir: path.join(__dirname, "tmp"),
    createParentPath: true,
    limits: {
      // Allows short profile videos while keeping uploads bounded.
      fileSize: 25 * 1024 * 1024,
    },
  })
);

// cron jobs
const tempDir = path.join(process.cwd(), "tmp");
cron.schedule("0 * * * *", () => {
  if (fs.existsSync(tempDir)) {
    fs.readdir(tempDir, (err, files) => {
      if (err) {
        console.log("error", err);
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
  if (req.path === "/health" || req.path.startsWith("/api/saavn") || req.path.startsWith("/api/songs/mood/") || isDatabaseConnected()) return next();
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
app.use("/api/comments", commentRoutes);
app.use("/health", healthRoutes);

if (process.env.NODE_ENV === "production") {
  app.use(express.static(frontendDistPath));
  app.get("*", (req, res) => {
    res.sendFile(path.join(frontendDistPath, "index.html"));
  });
}

// error handler
app.use((err, req, res, next) => {
  res
    .status(500)
    .json({
      message:
        process.env.NODE_ENV === "production"
          ? "Internal server error"
          : err.message,
    });
});

httpServer.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  void connectDB();
});
