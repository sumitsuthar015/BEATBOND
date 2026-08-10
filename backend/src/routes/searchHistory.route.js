import { Router } from "express";
import {
	getSearchHistory,
	addSearchHistory,
	clearSearchHistory,
	deleteSearchHistoryEntry,
	getPopularSearches,
	getSavedSearches,
	createSavedSearch,
	updateSavedSearch,
	deleteSavedSearch,
	checkSavedSearchesForNewResults,
} from "../controller/searchHistory.controller.js";
import { protectRoute } from "../middleware/auth.middleware.js";

const router = Router();

// Search History routes
router.get("/history", protectRoute, getSearchHistory);
router.post("/history", protectRoute, addSearchHistory);
router.delete("/history", protectRoute, clearSearchHistory);
router.delete("/history/:id", protectRoute, deleteSearchHistoryEntry);
router.get("/popular", protectRoute, getPopularSearches);

// Saved Searches routes
router.get("/saved", protectRoute, getSavedSearches);
router.post("/saved", protectRoute, createSavedSearch);
router.patch("/saved/:id", protectRoute, updateSavedSearch);
router.delete("/saved/:id", protectRoute, deleteSavedSearch);

// Admin/Cron job endpoint
router.post("/saved/check-new-results", checkSavedSearchesForNewResults);

export default router;