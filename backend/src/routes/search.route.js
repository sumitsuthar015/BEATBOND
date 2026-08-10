import { Router } from "express";
import {
	searchSongs,
	getSearchSuggestions,
	searchWithinPlaylist,
	searchWithinAlbum,
	getFilterOptions,
} from "../controller/search.controller.js";
import { protectRoute } from "../middleware/auth.middleware.js";

const router = Router();

// Main search endpoint
router.get("/", protectRoute, searchSongs);

// Autocomplete/Suggestions
router.get("/suggestions", protectRoute, getSearchSuggestions);

// Filter options
router.get("/filters", protectRoute, getFilterOptions);

// Scoped search within playlist/album
router.get("/playlist/:playlistId", protectRoute, searchWithinPlaylist);
router.get("/album/:albumId", protectRoute, searchWithinAlbum);

export default router;
