import mongoose from "mongoose";

const songSchema = new mongoose.Schema(
	{
		title: {
			type: String,
			required: true,
		},
		artist: {
			type: String,
			required: true,
		},
		imageUrl: {
			type: String,
			required: true,
		},
		audioUrl: {
			type: String,
			required: true,
		},
		duration: {
			type: Number,
			required: true,
		},
		albumId: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "Album",
			required: false,
		},
		likedBy: [{
			type: String,
		}],
		// Advanced search filter fields
		genre: {
			type: String,
			index: true,
		},
		year: {
			type: Number,
			index: true,
		},
		language: {
			type: String,
			index: true,
		},
		explicit: {
			type: Boolean,
			default: false,
			index: true,
		},
		mood: {
			type: String,
			index: true,
		},
		tags: [{
			type: String,
			index: true,
		}],
		playCount: {
			type: Number,
			default: 0,
			index: true,
		},
	},
	{ timestamps: true }
);

// Text index for full-text search
songSchema.index({
	title: "text",
	artist: "text",
	genre: "text",
	language: "text",
	mood: "text",
	tags: "text",
});

// Compound indexes for common filter combinations
songSchema.index({ genre: 1, year: -1 });
songSchema.index({ language: 1, genre: 1 });
songSchema.index({ explicit: 1, genre: 1 });
songSchema.index({ playCount: -1, createdAt: -1 });

export const Song = mongoose.model("Song", songSchema);
