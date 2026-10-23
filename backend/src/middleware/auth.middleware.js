import { clerkClient } from "@clerk/express";


import { User } from "../models/user.model.js";

export const protectRoute = async (req, res, next) => {
	if (!req.auth()?.userId) {
		return res.status(401).json({ message: "Unauthorized - you must be logged in" });
	}

	try {
		// Auto-ensure requesting user exists in MongoDB database
		const existingUser = await User.findOne({ clerkId: req.auth().userId });
		if (!existingUser) {
			// The auth callback is the only account-provisioning path. Its route
			// validates the user's current legal consent before reaching here.
			if (req.baseUrl !== "/api/auth" || req.path !== "/callback") {
				return res.status(409).json({ message: "Complete sign-in and accept the current Terms and Privacy Policy first." });
			}
			const clerkUser = await clerkClient.users.getUser(req.auth().userId);
			if (clerkUser) {
				const email = clerkUser.emailAddresses?.[0]?.emailAddress || "";
				const username = clerkUser.username || (email ? email.split("@")[0] : `user_${req.auth().userId.slice(-6)}`);
				const fullName = `${clerkUser.firstName || ""} ${clerkUser.lastName || ""}`.trim() || username;
				await User.create({
					clerkId: req.auth().userId,
					email,
					username,
					fullName,
					imageUrl: clerkUser.imageUrl || "",
					isOnline: true,
				});
			}
		}
	} catch (err) {
		console.error("Authenticated user provisioning failed:", err.message);
		return res.status(503).json({ message: "Sign-in could not be completed right now. Please retry shortly." });
	}

	next();
};

export const isAdminUser = async (userId) => {
	const configuredAdminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
	if (!configuredAdminEmail || !userId) return false;
	const currentUser = await clerkClient.users.getUser(userId);
	const primaryEmail = currentUser.primaryEmailAddress;
	const verifiedEmail = primaryEmail?.emailAddress?.trim().toLowerCase();
	return Boolean(primaryEmail?.verification?.status === "verified" && verifiedEmail && configuredAdminEmail === verifiedEmail);
};

export const requireAdmin = async (req, res, next) => {
	try {
		const isAdmin = await isAdminUser(req.auth().userId);

		if (!isAdmin) {
			return res.status(403).json({ message: "Unauthorized - you must be an admin" });
		}

		next();
	} catch (error) {
		next(error);
	}
};
