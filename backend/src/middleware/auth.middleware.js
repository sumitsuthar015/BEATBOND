import { clerkClient } from "@clerk/express";


import { User } from "../models/user.model.js";

export const protectRoute = async (req, res, next) => {
	if (!req.auth?.userId) {
		return res.status(401).json({ message: "Unauthorized - you must be logged in" });
	}

	try {
		// Auto-ensure requesting user exists in MongoDB database
		const existingUser = await User.findOne({ clerkId: req.auth.userId });
		if (!existingUser) {
			const clerkUser = await clerkClient.users.getUser(req.auth.userId);
			if (clerkUser) {
				const email = clerkUser.emailAddresses?.[0]?.emailAddress || "";
				const username = clerkUser.username || (email ? email.split("@")[0] : `user_${req.auth.userId.slice(-6)}`);
				const fullName = `${clerkUser.firstName || ""} ${clerkUser.lastName || ""}`.trim() || username;
				await User.create({
					clerkId: req.auth.userId,
					email,
					username,
					fullName,
					imageUrl: clerkUser.imageUrl || "",
					isOnline: true,
				});
			}
		}
	} catch (err) {
		console.error("Auto-sync user in protectRoute error:", err.message);
	}

	next();
};

export const isAdminUser = async (userId) => {
	const currentUser = await clerkClient.users.getUser(userId);
	return process.env.ADMIN_EMAIL === currentUser.primaryEmailAddress?.emailAddress;
};

export const requireAdmin = async (req, res, next) => {
	try {
		const isAdmin = await isAdminUser(req.auth.userId);

		if (!isAdmin) {
			return res.status(403).json({ message: "Unauthorized - you must be an admin" });
		}

		next();
	} catch (error) {
		next(error);
	}
};
