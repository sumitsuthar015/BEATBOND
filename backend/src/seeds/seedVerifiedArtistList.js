import { connectDB } from "../lib/db.js";
import { VerifiedArtist } from "../models/verifiedArtist.model.js";
import { curatedVerifiedArtists } from "../data/curatedVerifiedArtists.js";

const normalize = (value) => String(value || "")
	.normalize("NFD")
	.replace(/[\u0300-\u036f]/g, "")
	.toLowerCase()
	.replace(/[^a-z0-9]+/g, " ")
	.trim();

const run = async () => {
	await connectDB();
	const mongoose = await import("mongoose");
	if (mongoose.default.connection.readyState !== 1) throw new Error("MongoDB connection is unavailable.");

	const existing = await VerifiedArtist.find({}, { artistId: 1, name: 1 }).lean();
	const existingNames = new Set(existing.map((artist) => normalize(artist.name)));
	const additions = curatedVerifiedArtists.filter((name) => !existingNames.has(normalize(name)));
	const operations = additions.map((name) => {
		const slug = normalize(name).replace(/\s+/g, "-");
		return {
			updateOne: {
				filter: { artistId: `curated:${slug}` },
				update: { $setOnInsert: {
					artistId: `curated:${slug}`,
					name,
					imageUrl: "",
					followerCount: 0,
					providerVerified: false,
					verifiedBy: "curated-artist-list",
					verifiedAt: new Date(),
				} },
				upsert: true,
			},
		};
	});

	let inserted = 0;
	for (let index = 0; index < operations.length; index += 500) {
		const result = await VerifiedArtist.bulkWrite(operations.slice(index, index + 500), { ordered: false });
		inserted += result.upsertedCount;
	}
	console.log(`Added ${inserted} curated artist profiles; ${existingNames.size} artist names were already present.`);
	await mongoose.default.disconnect();
};

run().catch(async (error) => {
	console.error("Unable to add curated artist profiles:", error.message);
	try {
		const mongoose = await import("mongoose");
		await mongoose.default.disconnect();
	} catch { /* Ignore disconnect errors during startup failure. */ }
	process.exitCode = 1;
});
