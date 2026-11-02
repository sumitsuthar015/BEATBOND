import { mock, test } from "node:test";
import assert from "node:assert/strict";

let activeReport = null;
let reportCreated = null;
let target = { userId: "author-2", content: "Helpful feedback", songTitle: "Track", songArtist: "Artist" };
mock.module(new URL("../src/models/contentReport.model.js", import.meta.url), {
  namedExports: { ContentReport: {
    findOne: () => ({ select: () => ({ lean: async () => activeReport }) }),
    create: async (report) => { reportCreated = report; return { id: "report-1" }; },
  } },
});
mock.module(new URL("../src/models/comment.model.js", import.meta.url), {
  namedExports: { Comment: { findById: () => ({ select: () => ({ lean: async () => target }) }) } },
});
mock.module(new URL("../src/models/post.model.js", import.meta.url), {
  namedExports: { Post: { findById: () => ({ select: () => ({ populate: () => ({ lean: async () => target }) }) }) } },
});
const { reportContent } = await import("../src/controller/report.controller.js");

const response = () => {
  const res = { statusCode: 200, body: undefined };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; return res; };
  return res;
};
const request = (body) => ({ body, auth: () => ({ userId: "reporter-1" }) });

test("content reports reject unsupported reasons", async () => {
  const res = response();
  await reportContent(request({ targetType: "comment", targetId: "507f1f77bcf86cd799439011", reason: "invalid" }), res, () => {});
  assert.equal(res.statusCode, 400);
});

test("users cannot report their own comments", async () => {
  target = { userId: "reporter-1", content: "my comment" };
  const res = response();
  await reportContent(request({ targetType: "comment", targetId: "507f1f77bcf86cd799439011", reason: "spam" }), res, () => {});
  assert.equal(res.statusCode, 400);
  assert.match(res.body.message, /own content/i);
  target = { userId: "author-2", content: "Helpful feedback", songTitle: "Track", songArtist: "Artist" };
});

test("duplicate open reports are rejected", async () => {
  activeReport = { _id: "existing-report" };
  const res = response();
  await reportContent(request({ targetType: "comment", targetId: "507f1f77bcf86cd799439011", reason: "spam" }), res, () => {});
  assert.equal(res.statusCode, 409);
  activeReport = null;
});

test("valid reports persist a bounded preview and target metadata", async () => {
  const res = response();
  await reportContent(request({ targetType: "comment", targetId: "507f1f77bcf86cd799439011", reason: "harassment", details: "Please review" }), res, () => {});
  assert.equal(res.statusCode, 201);
  assert.equal(reportCreated.targetAuthorId, "author-2");
  assert.equal(reportCreated.contentPreview, "Helpful feedback");
  assert.equal(res.body.reportId, "report-1");
});
