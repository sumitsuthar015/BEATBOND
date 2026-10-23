import { clerkClient } from "@clerk/express";
import { User } from "../models/user.model.js";
import { photoStateOf, photoUpdate } from "../services/profile.service.js";
import { PRIVACY_VERSION, TERMS_VERSION } from "../services/legalConsent.service.js";

export const authCallback = async (req, res) => {
	try {
		const { legalConsent } = req.body;
		const id = req.auth().userId;
		const clerkUser = await clerkClient.users.getUser(id);
		if (!clerkUser) return res.status(401).json({ success: false, message: "Authentication failed" });
		const email = clerkUser.primaryEmailAddress?.emailAddress || clerkUser.emailAddresses?.[0]?.emailAddress || "";
		const username = clerkUser.username || (email ? email.split("@")[0] : `user_${id.slice(-6)}`);
		const fullName = `${clerkUser.firstName || ""} ${clerkUser.lastName || ""}`.trim() || username;
		const imageUrl = clerkUser.imageUrl || "";
		const consentAt = new Date();
		const legalConsents = {
			termsVersion: TERMS_VERSION,
			termsAcceptedAt: consentAt,
			privacyVersion: PRIVACY_VERSION,
			privacyAcceptedAt: consentAt,
		};

		// Find existing user
		let user = await User.findOne({ clerkId: id });
		if (!user) {
			// For new user creation
			const generatedUsername = username;
			
			// Create new user with required fields
			const newUser = {
				clerkId: id,
				email: email,
				username: generatedUsername,
				fullName,
				imageUrl,
				photoSource: 'provider',
				providerImageUrl: imageUrl,
				// Presence is set exclusively by an authenticated WebSocket connection.
				isOnline: false,
				legalConsents,
				emailMarketingOptIn: Boolean(legalConsent.emailMarketingOptIn),
				emailMarketingConsentUpdatedAt: legalConsent.emailMarketingOptIn ? consentAt : null,
			};

			try {
				user = await User.create(newUser);
			} catch (createError) {
				console.error('Error creating user:', createError.message);
				throw createError;
			}
		} else {
			// Update existing user's information
			try {
				user.email = email || user.email;
				user.legalConsents = legalConsents;
				if (legalConsent.emailMarketingOptIn === true && user.emailMarketingOptIn !== true) {
					user.emailMarketingOptIn = true;
					user.emailMarketingConsentUpdatedAt = consentAt;
				}
				// The name and photo edited in BeatBond win over the sign-in
				// account's; only fill them in when they're missing.
				user.fullName = user.fullName || fullName;
				// Keep the Google photo up to date, but only show it if it's the
				// picture this person chose.
				const photo = photoStateOf(user);
				user.set(photoUpdate({ ...photo, providerImageUrl: imageUrl || photo.providerImageUrl }));
				// Do not mark a user online during an HTTP auth callback: they may have
				// closed the browser or failed to establish a socket connection.
				await user.save();
			} catch (updateError) {
				console.error('Error updating user:', updateError.message);
				throw updateError;
			}
		}

		res.status(200).json({ 
			success: true,
			user: {
				clerkId: user.clerkId,
				username: user.username,
				fullName: user.fullName,
				imageUrl: user.imageUrl,
				legalConsents: user.legalConsents,
			}
		});
	} catch (error) {
		console.error('Authentication callback failed:', error.message);
		res.status(500).json({ 
			success: false,
			error: 'Authentication failed',
			message: 'Please retry sign-in. If this continues, contact support.'
		});
	}
};

export const getCurrentUser = async (req, res) => {
	try {
		const { userId } = req.auth();
		
		if (!userId) {
			return res.status(401).json({ error: 'No user ID provided' });
		}

		const user = await User.findOne({ clerkId: userId });
		
		if (!user) {
			return res.status(404).json({ error: 'User not found' });
		}

		res.json(user);
	} catch (error) {
		console.error('❌ Error getting current user:', error);
		res.status(500).json({ 
			error: 'Failed to get user',
			message: error.message 
		});
	}
};
