import mongoose from "mongoose";

const savedSearchSchema = new mongoose.Schema(
	{
		userId: {
			type: String,
			required: true,
			index: true,
		},
		name: {
			type: String,
			required: true,
			trim: true,
			maxlength: 100,
		},
		query: {
			type: String,
			required: true,
			trim: true,
		},
		filters: {
			type: mongoose.Schema.Types.Mixed,
			default: {},
		},
		notifyOnNewResults: {
			type: Boolean,
			default: false,
		},
		lastChecked: {
			type: Date,
			default: null,
		},
		lastResultCount: {
			type: Number,
			default: 0,
		},
		isActive: {
			type: Boolean,
			default: true,
		},
	},
	{ timestamps: true }
);

// Compound index for user's saved searches
savedSearchSchema.index({ userId: 1, createdAt: -1 });
// Index for finding active searches to check for new results
savedSearchSchema.index({ isActive: 1, notifyOnNewResults: 1, lastChecked: 1 });

export const SavedSearch = mongoose.model("SavedSearch", savedSearchSchema);