import { test } from "node:test";
import assert from "node:assert/strict";

const {
  buildDayKeys,
  deleteCommentAsAdmin,
  getDashboardOverview,
  resolveTimeZone,
} = await import("../src/controller/admin.controller.js");

const mockResponse = () => {
  const res = { statusCode: 200, body: undefined };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; return res; };
  return res;
};

test("resolveTimeZone keeps valid zones and falls back to UTC", () => {
  assert.equal(resolveTimeZone("Asia/Kolkata"), "Asia/Kolkata");
  assert.equal(resolveTimeZone("Not/AZone"), "UTC");
  assert.equal(resolveTimeZone(undefined), "UTC");
});

test("buildDayKeys returns consecutive local days ending today", () => {
  const now = new Date("2026-09-24T20:00:00Z"); // 25 Sept 01:30 in India
  const keys = buildDayKeys(now, 14, "Asia/Kolkata");

  assert.equal(keys.length, 14);
  assert.equal(keys.at(-1), "2026-09-25");
  assert.equal(keys[0], "2026-09-12");
});

test("dashboard overview returns 503 while the database is disconnected", async () => {
  const res = mockResponse();
  await getDashboardOverview({ query: {} }, res, () => {});

  assert.equal(res.statusCode, 503);
});

test("admin comment deletion rejects an invalid id before touching the database", async () => {
  const res = mockResponse();
  await deleteCommentAsAdmin({ params: { id: "not-an-id" } }, res, () => {});

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.message, "Invalid comment id");
});
