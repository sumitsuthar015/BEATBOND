import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const directory = path.dirname(fileURLToPath(import.meta.url));

// Load backend/.env before the other application modules execute, regardless
// of whether Node was started from the repository root or backend directory.
// In production, deployment-provided environment variables remain authoritative.
dotenv.config({
  path: path.resolve(directory, "../../.env"),
  override: process.env.NODE_ENV !== "production",
});
