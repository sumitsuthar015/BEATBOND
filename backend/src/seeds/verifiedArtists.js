import { connectDB } from "../lib/db.js";
import { VerifiedArtist } from "../models/verifiedArtist.model.js";
import { curatedVerifiedArtists } from "../data/curatedVerifiedArtists.js";
import { normalizeSearchQuery } from "../services/saavn.service.js";
import { searchArtistCandidates } from "../services/saavn.service.js";

const run = async () => {
	await connectDB();
	const connection = await import("mongoose");
	if (connection.default.connection.readyState !== 1) throw new Error("MongoDB connection is unavailable.");

	let nextIndex = 0;
	let verified = 0;
	const unresolved = [];
	const worker = async () => {
		while (nextIndex < curatedVerifiedArtists.length) {
			const name = curatedVerifiedArtists[nextIndex++];
			const candidates = await searchArtistCandidates(name, 20, false);
			const target = normalizeSearchQuery(name);
			const match = candidates.find((artist) => normalizeSearchQuery(artist.name) === target)
				|| candidates.find((artist) => normalizeSearchQuery(artist.name).startsWith(`${target} `));
			if (!match) {
				unresolved.push(name);
				if (candidates.length) console.log(`Possible matches for ${name}: ${candidates.slice(0, 5).map((candidate) => candidate.name).join(" | ")}`);
				// Keep the admin-approved name searchable even if this provider
				// region has no standalone artist profile for it. The curated ID
				// lets the profile endpoint show the approved name and any exact
				// song credits without borrowing a different artist's ID.
				const curatedId = `curated:${target.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
				await VerifiedArtist.findOneAndUpdate(
					{ artistId: curatedId },
					{ $set: { name, imageUrl: "", followerCount: 0, providerVerified: false, verifiedBy: "curated-artist-seed", verifiedAt: new Date() } },
					{ upsert: true, runValidators: true }
				);
				verified += 1;
				continue;
			}
			await VerifiedArtist.findOneAndUpdate(
				{ artistId: match.id },
				{ $set: {
					name,
					imageUrl: match.imageUrl || "",
					followerCount: match.followerCount || 0,
					providerVerified: Boolean(match.isVerified),
					verifiedBy: "curated-artist-seed",
					verifiedAt: new Date(),
				} },
				{ upsert: true, runValidators: true }
			);
			verified += 1;
		}
	};

	await Promise.all(Array.from({ length: 4 }, worker));
	console.log(`Approved ${verified}/${curatedVerifiedArtists.length} curated artists.`);
	if (unresolved.length) console.log(`Using curated name-only profiles where no standalone provider profile resolved: ${unresolved.join(", ")}`);
	await connection.default.disconnect();
};

run().catch(async (error) => {
	console.error("Unable to seed verified artists:", error.message);
	try {
		const connection = await import("mongoose");
		await connection.default.disconnect();
	} catch { /* Ignore disconnect errors during startup failure. */ }
	process.exitCode = 1;
});
