import { test } from "node:test";
import assert from "node:assert/strict";

// An empty key keeps the AI client disabled; dotenv never overrides a set variable.
process.env.GROQ_API_KEY = "";

const { getMoodSongs } = await import("../src/controller/song.controller.js");
const { chatWithAI } = await import("../src/controller/chat.controller.js");
const { protectRoute } = await import("../src/middleware/auth.middleware.js");

const mockResponse = () => {
  const res = { statusCode: 200, body: undefined };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; return res; };
  return res;
};

test("GET /api/songs/mood/:mood returns 400 for an unsupported mood", async () => {
  const res = mockResponse();
  await getMoodSongs({ params: { mood: "angry" } }, res);

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.message, "Invalid mood");
});

test("AI therapy chat returns 503 when the AI service is not configured", async () => {
  const res = mockResponse();
  await chatWithAI({ body: { messages: [{ role: "user", content: "I feel low" }] } }, res);

  assert.equal(res.statusCode, 503);
  assert.match(res.body.message, /not configured/);
});

test("protectRoute blocks requests from users who are not logged in", async () => {
  const res = mockResponse();
  let nextCalled = false;
  await protectRoute({ auth: {} }, res, () => { nextCalled = true; });

  assert.equal(res.statusCode, 401);
  assert.equal(nextCalled, false);
});
