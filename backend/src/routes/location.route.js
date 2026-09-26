import { Router } from "express";
import { protectRoute } from "../middleware/auth.middleware.js";
import { disableMyLocation, getFriendLocations, getLiveLocation, getLiveLocations, getMapContext, getMyLocationPreference, searchMapPlace, updateMyLocation, updateMyLocationVisibility } from "../controller/location.controller.js";
const router = Router();
// Map context is read-only, contains no user location records, and is needed
// while the auth session is still restoring on app launch.
router.get("/context", getMapContext);
router.get("/search", searchMapPlace);
router.use(protectRoute);
router.get("/live", getLiveLocations);
router.get("/live/:userId", getLiveLocation);
router.get("/friends", getFriendLocations);
router.get("/me", getMyLocationPreference);
router.put("/me", updateMyLocation);
router.patch("/me/visibility", updateMyLocationVisibility);
router.delete("/me", disableMyLocation);
export default router;
