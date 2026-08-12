import { Router } from "express";
import { protectRoute } from "../middleware/auth.middleware.js";
import { disableMyLocation, getFriendLocations, getLiveLocations, getMapContext, searchMapPlace, updateMyLocation } from "../controller/location.controller.js";
const router = Router();
// Map context is read-only, contains no user location records, and is needed
// while the auth session is still restoring on app launch.
router.get("/context", getMapContext);
router.get("/search", searchMapPlace);
router.use(protectRoute);
router.get("/live", getLiveLocations);
router.get("/friends", getFriendLocations);
router.put("/me", updateMyLocation);
router.delete("/me", disableMyLocation);
export default router;
