import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
	{
		clerkId: {
			type: String,
			required: true,
			unique: true,
		},
		username: {
			type: String,
			required: true,
			unique: true,
			trim: true,
		},
		email: {
			type: String,
			required: true,
			unique: true,
			trim: true,
		},
		fullName: {
			type: String,
			required: true,
			trim: true,
		},
		imageUrl: {
			type: String,
			default: "",
		},
		bio: {
			type: String,
			default: "",
			maxlength: 500,
		},
		location: {
			type: String,
			default: "",
		},
		website: {
			type: String,
			default: "",
		},
		isOnline: {
			type: Boolean,
			default: false,
		},
		lastSeen: {
			type: Date,
			default: Date.now,
		},
		friends: [{
			type: String, // clerkId of friends
			ref: 'User'
		}],
		blockedUsers: [{
			type: String, // clerkId of blocked users
			ref: 'User'
		}],
		// ⭐ NEW FIELD - Music Privacy Setting
		musicPrivacy: {
			type: String,
			enum: ['everyone', 'friends', 'none'],
			default: 'friends' // Default: only friends can see
		},
		// ⭐ NEW FIELD - Current Activity (optional, for caching)
		currentActivity: {
			type: String,
			default: null
		}
	},
	{
		timestamps: true,
	}
);

// Pre-save middleware to update lastSeen
userSchema.pre('save', function(next) {
	if (this.isModified('isOnline') && this.isOnline === false) {
		this.lastSeen = new Date();
	}
	next();
});

// Create text index for search functionality
userSchema.index({ fullName: 'text' });

export const User = mongoose.model("User", userSchema);