import mongoose from "mongoose";
import { Song } from "../models/song.model.js";
import { config } from "dotenv";

config();

const songs = [
	{
		title: "Stay With Me",
		artist: "Sarah Mitchell",
		imageUrl: "/cover-images/1.jpg",
		audioUrl: "/songs/1.mp3",
		duration: 46, // 0:46
	},
	{
		title: "Midnight Drive",
		artist: "The Wanderers",
		imageUrl: "/cover-images/2.jpg",
		audioUrl: "/songs/2.mp3",
		duration: 41, // 0:41
	},
	{
		title: "Lost in Tokyo",
		artist: "Electric Dreams",
		imageUrl: "/cover-images/3.jpg",
		audioUrl: "/songs/3.mp3",
		duration: 24, // 0:24
	},
	{
		title: "Summer Daze",
		artist: "Coastal Kids",
		imageUrl: "/cover-images/4.jpg",
		audioUrl: "/songs/4.mp3",
		duration: 24, // 0:24
	},
	{
		title: "Neon Lights",
		artist: "Night Runners",
		imageUrl: "/cover-images/5.jpg",
		audioUrl: "/songs/5.mp3",
		duration: 36, // 0:36
	},
	{
		title: "Mountain High",
		artist: "The Wild Ones",
		imageUrl: "/cover-images/6.jpg",
		audioUrl: "/songs/6.mp3",
		duration: 40, // 0:40
	},
	{
		title: "City Rain",
		artist: "Urban Echo",
		imageUrl: "/cover-images/7.jpg",
		audioUrl: "/songs/7.mp3",
		duration: 39, // 0:39
	},
	{
		title: "Desert Wind",
		artist: "Sahara Sons",
		imageUrl: "/cover-images/8.jpg",
		audioUrl: "/songs/8.mp3",
		duration: 28, // 0:28
	},
	{
		title: "Ocean Waves",
		artist: "Coastal Drift",
		imageUrl: "/cover-images/9.jpg",
		audioUrl: "/songs/9.mp3",
		duration: 28, // 0:28
	},
	{
		title: "Starlight",
		artist: "Luna Bay",
		imageUrl: "/cover-images/10.jpg",
		audioUrl: "/songs/10.mp3",
		duration: 30, // 0:30
	},
	{
		title: "Winter Dreams",
		artist: "Arctic Pulse",
		imageUrl: "/cover-images/11.jpg",
		audioUrl: "/songs/11.mp3",
		duration: 29, // 0:29
	},
	{
		title: "Purple Sunset",
		artist: "Dream Valley",
		imageUrl: "/cover-images/12.jpg",
		audioUrl: "/songs/12.mp3",
		duration: 17, // 0:17
	},
	{
		title: "Neon Dreams",
		artist: "Cyber Pulse",
		imageUrl: "/cover-images/13.jpg",
		audioUrl: "/songs/13.mp3",
		duration: 39, // 0:39
	},
	{
		title: "Moonlight Dance",
		artist: "Silver Shadows",
		imageUrl: "/cover-images/14.jpg",
		audioUrl: "/songs/14.mp3",
		duration: 27, // 0:27
	},
	{
		title: "Urban Jungle",
		artist: "City Lights",
		imageUrl: "/cover-images/15.jpg",
		audioUrl: "/songs/15.mp3",
		duration: 36, // 0:36
	},
	{
		title: "Crystal Rain",
		artist: "Echo Valley",
		imageUrl: "/cover-images/16.jpg",
		audioUrl: "/songs/16.mp3",
		duration: 39, // 0:39
	},
	{
		title: "Neon Tokyo",
		artist: "Future Pulse",
		imageUrl: "/cover-images/17.jpg",
		audioUrl: "/songs/17.mp3",
		duration: 39, // 0:39
	},
	{
		title: "Midnight Blues",
		artist: "Jazz Cats",
		imageUrl: "/cover-images/18.jpg",
		audioUrl: "/songs/18.mp3",
		duration: 29, // 0:29
	},
];

const seedSongs = async () => {
	// FIX: fail fast with a clear message instead of letting
	// mongoose.connect(undefined) throw a confusing driver-level error.
	if (!process.env.MONGODB_URI) {
		console.error("MONGODB_URI is not set. Check your .env file.");
		process.exitCode = 1;
		return;
	}

	try {
		await mongoose.connect(process.env.MONGODB_URI);

		// FIX: this used to be `await Song.deleteMany({}); await Song.insertMany(songs);`
		// which wipes EVERY song in the collection — including ones that
		// your other seed script (seedDatabase.js) linked into Album.songs
		// arrays. Deleting them here but leaving Albums untouched left
		// albums pointing at Song._ids that no longer existed.
		//
		// Upserting by `audioUrl` (a stable, unique-per-track key here)
		// updates songs that already exist and inserts ones that don't,
		// without ever deleting anything — so existing Album references
		// stay valid.
		let created = 0;
		let updated = 0;

		for (const song of songs) {
			// FIX: added `plays` so songs from this script have the same
			// shape as songs from seedDatabase.js (which sets a random
			// plays count). Without this, anything sorting/filtering by
			// play count would behave inconsistently between the two
			// seed sources.
			const result = await Song.updateOne(
				{ audioUrl: song.audioUrl },
				{
					$set: {
						title: song.title,
						artist: song.artist,
						imageUrl: song.imageUrl,
						duration: song.duration,
					},
					$setOnInsert: {
						plays: Math.floor(Math.random() * 5000),
					},
				},
				{ upsert: true }
			);

			if (result.upsertedCount > 0) {
				created += 1;
			} else if (result.modifiedCount > 0) {
				updated += 1;
			}
		}

		console.log(
			`Songs seeded successfully! (${created} created, ${updated} updated, ${songs.length} total)`
		);
	} catch (error) {
		console.error("Error seeding songs:", error);
		process.exitCode = 1;
	} finally {
		// FIX: close() returns a promise; not awaiting it risked the
		// process exiting before the connection actually closed.
		try {
			await mongoose.connection.close();
		} catch (closeError) {
			console.error("Error closing MongoDB connection:", closeError);
		}
	}
};

seedSongs();