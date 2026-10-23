import { SearchHistory } from "../models/searchHistory.model.js";
import { SavedSearch } from "../models/savedSearch.model.js";

// Get user's search history
export const getSearchHistory = async (req, res, next) => {
	try {
		const userId = req.auth().userId;
		const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 50));
		const offset = Math.min(10_000, Math.max(0, Number.parseInt(req.query.offset, 10) || 0));

		const history = await SearchHistory.find({ userId })
			.sort({ createdAt: -1 })
			.skip(Number(offset))
			.limit(Number(limit))
			.lean();

		const total = await SearchHistory.countDocuments({ userId });

		res.status(200).json({
			history,
			pagination: {
				total,
				limit: Number(limit),
				offset: Number(offset),
				hasMore: Number(offset) + Number(limit) < total,
			},
		});
	} catch (error) {
		next(error);
	}
};

// Add search to history
export const addSearchHistory = async (req, res, next) => {
	try {
		const userId = req.auth().userId;
		const { query, resultCount, filters, clickedResult, clickedResultType } = req.body;

		if (typeof query !== "string" || !query.trim() || query.length > 200) {
			return res.status(400).json({ message: "Query is required" });
		}
		if (filters !== undefined && (!filters || typeof filters !== "object" || Array.isArray(filters))) {
			return res.status(400).json({ message: "Filters must be an object" });
		}
		if (typeof resultCount !== "undefined" && (!Number.isInteger(resultCount) || resultCount < 0 || resultCount > 100_000)) {
			return res.status(400).json({ message: "Invalid result count" });
		}
		if (typeof clickedResult === "string" && clickedResult.length > 300) return res.status(400).json({ message: "Clicked result is too long" });
		if (clickedResultType !== undefined && !["song", "artist", "album", "playlist", null].includes(clickedResultType)) {
			return res.status(400).json({ message: "Invalid clicked result type" });
		}

		// Check if this exact query was recently searched (within last hour)
		const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
		const recentSearch = await SearchHistory.findOne({
			userId,
			query: query.trim(),
			createdAt: { $gte: oneHourAgo },
		});

		if (recentSearch) {
			// Update the existing record with new timestamp and result count
			recentSearch.resultCount = resultCount || recentSearch.resultCount;
			recentSearch.filters = filters || recentSearch.filters;
			recentSearch.clickedResult = clickedResult || recentSearch.clickedResult;
			recentSearch.clickedResultType = clickedResultType || recentSearch.clickedResultType;
			recentSearch.createdAt = new Date();
			await recentSearch.save();

			return res.status(200).json({ history: recentSearch, updated: true });
		}

		// Create new history entry
		const history = await SearchHistory.create({
			userId,
			query: query.trim(),
			resultCount: resultCount || 0,
			filters: filters || {},
			clickedResult: clickedResult || null,
			clickedResultType: clickedResultType || null,
		});

		// Keep only last 100 searches per user
		const count = await SearchHistory.countDocuments({ userId });
		if (count > 100) {
			const oldest = await SearchHistory.find({ userId })
				.sort({ createdAt: 1 })
				.limit(count - 100)
				.select("_id");
			await SearchHistory.deleteMany({ _id: { $in: oldest.map((d) => d._id) } });
		}

		res.status(201).json({ history, updated: false });
	} catch (error) {
		next(error);
	}
};

// Clear user's search history
export const clearSearchHistory = async (req, res, next) => {
	try {
		const userId = req.auth().userId;
		await SearchHistory.deleteMany({ userId });
		res.status(200).json({ message: "Search history cleared" });
	} catch (error) {
		next(error);
	}
};

// Delete specific search history entry
export const deleteSearchHistoryEntry = async (req, res, next) => {
	try {
		const userId = req.auth().userId;
		const { id } = req.params;

		const entry = await SearchHistory.findOneAndDelete({ _id: id, userId });
		if (!entry) {
			return res.status(404).json({ message: "History entry not found" });
		}

		res.status(200).json({ message: "History entry deleted" });
	} catch (error) {
		next(error);
	}
};

// Get popular/trending searches
export const getPopularSearches = async (req, res, next) => {
	try {
		const { timeframe = "7d" } = req.query;
		const limit = Math.min(50, Math.max(1, Number.parseInt(req.query.limit, 10) || 10));

		let startDate;
		switch (timeframe) {
			case "1d":
				startDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
				break;
			case "7d":
				startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
				break;
			case "30d":
				startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
				break;
			default:
				startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
		}

		const popular = await SearchHistory.aggregate([
			{ $match: { createdAt: { $gte: startDate } } },
			{ $group: { _id: "$query", count: { $sum: 1 }, lastSearched: { $max: "$createdAt" } } },
			{ $sort: { count: -1, lastSearched: -1 } },
			{ $limit: Number(limit) },
			{ $project: { query: "$_id", count: 1, lastSearched: 1, _id: 0 } },
		]);

		res.status(200).json({ popular });
	} catch (error) {
		next(error);
	}
};

// Saved Searches Controllers

// Get user's saved searches
export const getSavedSearches = async (req, res, next) => {
	try {
		const userId = req.auth().userId;
		const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 50));
		const offset = Math.min(10_000, Math.max(0, Number.parseInt(req.query.offset, 10) || 0));

		const searches = await SavedSearch.find({ userId, isActive: true })
			.sort({ createdAt: -1 })
			.skip(Number(offset))
			.limit(Number(limit))
			.lean();

		const total = await SavedSearch.countDocuments({ userId, isActive: true });

		res.status(200).json({
			searches,
			pagination: {
				total,
				limit: Number(limit),
				offset: Number(offset),
				hasMore: Number(offset) + Number(limit) < total,
			},
		});
	} catch (error) {
		next(error);
	}
};

// Create a saved search
export const createSavedSearch = async (req, res, next) => {
	try {
		const userId = req.auth().userId;
		const { name, query, filters, notifyOnNewResults } = req.body;

		if (typeof name !== "string" || !name.trim() || name.length > 100) {
			return res.status(400).json({ message: "Name is required" });
		}
		if (typeof query !== "string" || !query.trim() || query.length > 200) {
			return res.status(400).json({ message: "Query is required" });
		}
		if (filters !== undefined && (!filters || typeof filters !== "object" || Array.isArray(filters))) {
			return res.status(400).json({ message: "Filters must be an object" });
		}
		if (notifyOnNewResults !== undefined && typeof notifyOnNewResults !== "boolean") {
			return res.status(400).json({ message: "notifyOnNewResults must be a boolean" });
		}

		// Check for duplicate
		const existing = await SavedSearch.findOne({ userId, query: query.trim(), isActive: true });
		if (existing) {
			return res.status(409).json({ message: "This search is already saved", search: existing });
		}

		const savedSearch = await SavedSearch.create({
			userId,
			name: name.trim(),
			query: query.trim(),
			filters: filters || {},
			notifyOnNewResults: notifyOnNewResults === true,
		});

		res.status(201).json({ search: savedSearch });
	} catch (error) {
		next(error);
	}
};

// Update a saved search
export const updateSavedSearch = async (req, res, next) => {
	try {
		const userId = req.auth().userId;
		const { id } = req.params;
		const { name, filters, notifyOnNewResults, isActive } = req.body;
		const updates = {};
		if (name !== undefined) {
			if (typeof name !== "string" || !name.trim() || name.length > 100) return res.status(400).json({ message: "Name must be between 1 and 100 characters" });
			updates.name = name.trim();
		}
		if (filters !== undefined) {
			if (!filters || typeof filters !== "object" || Array.isArray(filters)) return res.status(400).json({ message: "Filters must be an object" });
			updates.filters = filters;
		}
		if (notifyOnNewResults !== undefined) {
			if (typeof notifyOnNewResults !== "boolean") return res.status(400).json({ message: "notifyOnNewResults must be a boolean" });
			updates.notifyOnNewResults = notifyOnNewResults;
		}
		if (isActive !== undefined) {
			if (typeof isActive !== "boolean") return res.status(400).json({ message: "isActive must be a boolean" });
			updates.isActive = isActive;
		}

		const savedSearch = await SavedSearch.findOneAndUpdate(
			{ _id: id, userId },
			{ $set: updates },
			{ new: true, runValidators: true }
		);

		if (!savedSearch) {
			return res.status(404).json({ message: "Saved search not found" });
		}

		res.status(200).json({ search: savedSearch });
	} catch (error) {
		next(error);
	}
};

// Delete a saved search
export const deleteSavedSearch = async (req, res, next) => {
	try {
		const userId = req.auth().userId;
		const { id } = req.params;

		const savedSearch = await SavedSearch.findOneAndDelete({ _id: id, userId });
		if (!savedSearch) {
			return res.status(404).json({ message: "Saved search not found" });
		}

		res.status(200).json({ message: "Saved search deleted" });
	} catch (error) {
		next(error);
	}
};

// Check saved searches for new results (background job endpoint)
export const checkSavedSearchesForNewResults = async (req, res, next) => {
	try {
		// This endpoint can be called by a cron job
		const searches = await SavedSearch.find({
			isActive: true,
			notifyOnNewResults: true,
		}).lean();

		const results = [];

		for (const search of searches) {
			// This would call the actual search function
			// For now, we'll just update the lastChecked timestamp
			await SavedSearch.findByIdAndUpdate(search._id, {
				lastChecked: new Date(),
			});
			results.push({ searchId: search._id, checked: true });
		}

		res.status(200).json({ checked: results.length, results });
	} catch (error) {
		next(error);
	}
};
