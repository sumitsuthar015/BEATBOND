import { v2 as cloudinary } from "cloudinary";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

// Resolve this file explicitly. This also works when the server is started
// from the repository root instead of the backend directory.
const directory = path.dirname(fileURLToPath(import.meta.url));
// Local development must use the values the developer just saved in
// backend/.env, rather than stale CLOUDINARY_* values inherited by a terminal
// or IDE process. Hosted environments keep their platform-managed values.
dotenv.config({
  path: path.resolve(directory, "../../.env"),
  override: process.env.NODE_ENV !== "production",
});

// Trim values so copied credentials with an accidental trailing space do not
// generate an invalid Cloudinary upload signature.
const credential = (name) => process.env[name]?.trim();

cloudinary.config({
	cloud_name: credential("CLOUDINARY_CLOUD_NAME"),
	api_key: credential("CLOUDINARY_API_KEY"),
	api_secret: credential("CLOUDINARY_API_SECRET"),
	secure: true,
});

export default cloudinary;
