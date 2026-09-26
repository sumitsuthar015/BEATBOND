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
		// imageUrl is the picture every screen shows, derived from photoSource.
		// The three pictures below are all kept so the owner can switch back.
		// photoSource has no default: missing means an account from before photo
		// choices existed (see photoStateOf).
		photoSource: {
			type: String,
			enum: ["provider", "upload", "avatar", "none"],
		},
		providerImageUrl: { type: String, default: "" }, // Google / sign-in photo
		photoUrl: { type: String, default: "" }, // photo they uploaded
		avatarImageUrl: { type: String, default: "" }, // picture of their avatar
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
		// Who can see your top artists and recently played songs. History was
		// never shown before this setting existed, so it starts as only you.
		historyPrivacy: {
			type: String,
			enum: ["everyone", "friends", "none"],
			default: "none"
		},
		// Chat settings. Read receipts and online status work both ways: turn
		// yours off and you don't see other people's either.
		readReceipts: { type: Boolean, default: true },
		showActivityStatus: { type: Boolean, default: true },
		messageNotifications: { type: Boolean, default: true },
		// Friends whose messages don't create notifications.
		mutedChats: [{ type: String }],
		// People who never see your listening (now playing or history).
		musicHiddenFrom: [{
			type: String, // clerkId
		}],
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