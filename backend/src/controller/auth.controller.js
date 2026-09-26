import { User } from "../models/user.model.js";
import { photoStateOf, photoUpdate } from "../services/profile.service.js";

export const authCallback = async (req, res) => {
	try {
		const { email_addresses, username, first_name, last_name, image_url } = req.body;
		const id = req.auth.userId;

		// Find existing user
		let user = await User.findOne({ clerkId: id });
		if (!user) {
			// For new user creation
			const email = email_addresses || '';
			const generatedUsername = username || email.split('@')[0] || `user_${Date.now()}`;
			
			// Create new user with required fields
			const newUser = {
				clerkId: id,
				email: email,
				username: generatedUsername,
				fullName: `${first_name || ''} ${last_name || ''}`.trim(),
				imageUrl: image_url || '',
				photoSource: 'provider',
				providerImageUrl: image_url || '',
				// Presence is set exclusively by an authenticated Socket.IO connection.
				isOnline: false
			};

			try {
				user = await User.create(newUser);
			} catch (createError) {
				console.error('Error creating user:', createError);
				throw new Error(`Failed to create user: ${createError.message}`);
			}
		} else {
			// Update existing user's information
			try {
				user.email = email_addresses || user.email;
				// The name and photo edited in BeatBond win over the sign-in
				// account's; only fill them in when they're missing.
				user.fullName = user.fullName || `${first_name || ''} ${last_name || ''}`.trim();
				// Keep the Google photo up to date, but only show it if it's the
				// picture this person chose.
				const photo = photoStateOf(user);
				user.set(photoUpdate({ ...photo, providerImageUrl: image_url || photo.providerImageUrl }));
				// Do not mark a user online during an HTTP auth callback: they may have
				// closed the browser or failed to establish a socket connection.
				await user.save();
			} catch (updateError) {
				console.error('Error updating user:', updateError);
				throw new Error(`Failed to update user: ${updateError.message}`);
			}
		}

		res.status(200).json({ 
			success: true,
			user 
		});
	} catch (error) {
		console.error('Authentication callback failed:', error.message);
		res.status(500).json({ 
			success: false,
			error: 'Authentication failed',
			message: error.message 
		});
	}
};

export const getCurrentUser = async (req, res) => {
	try {
		const { userId } = req.auth;
		
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
