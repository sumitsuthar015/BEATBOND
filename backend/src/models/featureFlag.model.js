import mongoose from "mongoose";

const featureFlagSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true, trim: true, minlength: 2, maxlength: 64, match: /^[a-z][a-z0-9_]{1,63}$/ },
  enabled: { type: Boolean, required: true, default: false },
  updatedBy: { type: String, required: true, maxlength: 128 },
}, { timestamps: true });

export const FeatureFlag = mongoose.model("FeatureFlag", featureFlagSchema);

