import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { connectDB } from "../lib/db.js";
import { VerifiedArtist } from "../models/verifiedArtist.model.js";
import { curatedVerifiedArtists } from "../data/curatedVerifiedArtists.js";

const normalize = (value) => String(value || "")
	.normalize("NFD")
	.replace(/[\u0300-\u036f]/g, "")
	.toLowerCase()
	.replace(/[^a-z0-9]+/g, " ")
	.trim();

const hasLogo = (value) => {
	if (typeof value !== "string" || !/^https?:\/\//i.test(value)) return false;
	return !/(default|placeholder|avatar-default|artist-default|no-image)/i.test(value);
};

const run = async () => {
	await connectDB();
	const mongoose = await import("mongoose");
	if (mongoose.default.connection.readyState !== 1) throw new Error("MongoDB connection is unavailable.");

	const allArtists = await VerifiedArtist.find({}, { artistId: 1, name: 1, imageUrl: 1 }).lean();
	const removeIds = allArtists.filter((artist) => !hasLogo(artist.imageUrl)).map((artist) => artist._id);
	if (removeIds.length) await VerifiedArtist.deleteMany({ _id: { $in: removeIds } });

	const remainingNames = new Set(allArtists.filter((artist) => hasLogo(artist.imageUrl)).map((artist) => normalize(artist.name)));
	const keptCuratedNames = curatedVerifiedArtists.filter((name) => remainingNames.has(normalize(name)));
	const dataPath = fileURLToPath(new URL("../data/curatedVerifiedArtists.js", import.meta.url));
	const dataFile = `export const curatedVerifiedArtists = [\n${keptCuratedNames.map((name) => `\t${JSON.stringify(name)}`).join(",\n")}\n];\n`;
	await writeFile(dataPath, dataFile);

	console.log(`Removed ${removeIds.length} verified artists without a logo; ${allArtists.length - removeIds.length} approved profiles with logos remain.`);
	console.log(`Curated seed list now contains ${keptCuratedNames.length} names that still have logos.`);
	await mongoose.default.disconnect();
};

run().catch(async (error) => {
	console.error("Unable to remove artists without logos:", error.message);
	try {
		const mongoose = await import("mongoose");
		await mongoose.default.disconnect();
	} catch { /* Ignore disconnect errors during startup failure. */ }
	process.exitCode = 1;
});
