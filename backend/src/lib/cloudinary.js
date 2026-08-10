import { v2 as cloudinary } from "cloudinary";

import dotenv from "dotenv";
dotenv.config();

// Trim values so copied credentials with an accidental trailing space do not
// generate an invalid Cloudinary upload signature.
const credential = (name) => process.env[name]?.trim();

cloudinary.config({
	cloud_name: credential("CLOUDINARY_CLOUD_NAME"),
	api_key: credential("CLOUDINARY_API_KEY"),
	api_secret: credential("CLOUDINARY_API_SECRET"),
});

export default cloudinary;
