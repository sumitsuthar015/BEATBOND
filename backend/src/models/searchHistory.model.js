import mongoose from "mongoose";

const searchHistorySchema = new mongoose.Schema(
	{
		userId: {
			type: String,
			required: true,
			index: true,
		},
		query: {
			type: String,
			required: true,
			trim: true,
		},
		resultCount: {
			type: Number,
			default: 0,
		},
		filters: {
			type: mongoose.Schema.Types.Mixed,
			default: {},
		},
		clickedResult: {
			type: String,
			default: null,
		},
		clickedResultType: {
			type: String,
			enum: ["song", "artist", "album", "playlist", null],
			default: null,
		},
	},
	{ timestamps: true }
);

// Compound index for efficient user history queries
searchHistorySchema.index({ userId: 1, createdAt: -1 });
// Index for finding popular searches
searchHistorySchema.index({ query: 1, createdAt: -1 });

export const SearchHistory = mongoose.model("SearchHistory", searchHistorySchema);