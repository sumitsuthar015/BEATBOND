import mongoose from "mongoose";

const contentReportSchema = new mongoose.Schema({
  reporterId: { type: String, required: true, index: true },
  targetType: { type: String, enum: ["post", "comment"], required: true },
  targetId: { type: String, required: true },
  targetAuthorId: { type: String, required: true },
  reason: { type: String, enum: ["spam", "harassment", "hate", "nudity", "violence", "copyright", "other"], required: true },
  details: { type: String, trim: true, maxlength: 500, default: "" },
  contentPreview: { type: String, maxlength: 500, default: "" },
  status: { type: String, enum: ["open", "dismissed", "removed"], default: "open", index: true },
  reviewedBy: { type: String, default: "" },
  reviewedAt: { type: Date, default: null },
}, { timestamps: true });

contentReportSchema.index({ status: 1, createdAt: -1 });
contentReportSchema.index({ reporterId: 1, targetType: 1, targetId: 1, status: 1 });

export const ContentReport = mongoose.model("ContentReport", contentReportSchema);
