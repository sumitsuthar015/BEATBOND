import test from "node:test";
import assert from "node:assert/strict";
import { getAllowedOrigins, isAllowedOrigin } from "../src/lib/allowedOrigins.js";

test("deployment origin settings accept comma-separated frontend origins", () => {
  const previous = { nodeEnv: process.env.NODE_ENV, client: process.env.CLIENT_URL, extra: process.env.ALLOWED_ORIGINS };
  process.env.NODE_ENV = "production";
  process.env.CLIENT_URL = "https://app.example.com, https://preview.example.com/";
  process.env.ALLOWED_ORIGINS = "https://custom.example.com";
  try {
    const allowed = getAllowedOrigins();
    assert.equal(allowed.has("https://app.example.com"), true);
    assert.equal(allowed.has("https://preview.example.com"), true);
    assert.equal(isAllowedOrigin("https://custom.example.com"), true);
    assert.equal(isAllowedOrigin("https://attacker.example"), false);
  } finally {
    if (previous.nodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previous.nodeEnv;
    if (previous.client === undefined) delete process.env.CLIENT_URL; else process.env.CLIENT_URL = previous.client;
    if (previous.extra === undefined) delete process.env.ALLOWED_ORIGINS; else process.env.ALLOWED_ORIGINS = previous.extra;
  }
});

