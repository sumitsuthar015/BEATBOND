import { Router } from "express";
import { authCallback } from "../controller/auth.controller.js";
import { protectRoute } from "../middleware/auth.middleware.js";
import { isCurrentLegalConsent } from "../services/legalConsent.service.js";

const router = Router();

router.post("/callback", (req, res, next) => {
  if (!isCurrentLegalConsent(req.body?.legalConsent)) {
    return res.status(400).json({ message: "Accept the current Terms of Service and Privacy Policy to continue." });
  }
  next();
}, protectRoute, authCallback);

export default router;
