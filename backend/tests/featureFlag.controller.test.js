import test from "node:test";
import assert from "node:assert/strict";
import { FeatureFlag } from "../src/models/featureFlag.model.js";
import { resetFeatureFlag, updateFeatureFlag } from "../src/controller/featureFlag.controller.js";

const response = () => {
  const res = { statusCode: 200, body: null };
  res.status = (statusCode) => { res.statusCode = statusCode; return res; };
  res.json = (body) => { res.body = body; return res; };
  return res;
};

test("feature flag updates reject invalid names and non-boolean values", async () => {
  const invalidNameResponse = response();
  await updateFeatureFlag({ params: { name: "Bad Name" }, body: { enabled: true } }, invalidNameResponse, () => {});
  assert.equal(invalidNameResponse.statusCode, 400);

  const invalidBodyResponse = response();
  await updateFeatureFlag({ params: { name: "daily_mixes" }, body: { enabled: "yes" } }, invalidBodyResponse, () => {});
  assert.equal(invalidBodyResponse.statusCode, 400);
  assert.match(invalidBodyResponse.body.message, /enabled boolean/i);
});

test("valid admin feature flag update stores the authenticated updater", async () => {
  const original = FeatureFlag.findOneAndUpdate;
  let update;
  FeatureFlag.findOneAndUpdate = (filter, change, options) => {
    update = { filter, change, options };
    return { select: () => ({ lean: async () => ({ name: filter.name, enabled: change.$set.enabled, updatedBy: change.$set.updatedBy, updatedAt: new Date("2026-11-03T00:00:00Z") }) }) };
  };
  try {
    const res = response();
    await updateFeatureFlag({ params: { name: "daily_mixes" }, body: { enabled: true }, auth: () => ({ userId: "admin_user" }) }, res, () => {});
    assert.equal(res.statusCode, 200);
    assert.equal(update.filter.name, "daily_mixes");
    assert.equal(update.change.$set.updatedBy, "admin_user");
    assert.equal(update.options.upsert, true);
    assert.equal(res.body.flag.source, "admin");
  } finally {
    FeatureFlag.findOneAndUpdate = original;
  }
});

test("reset removes the saved override so environment rollout applies again", async () => {
  const original = FeatureFlag.deleteOne;
  let deletedName;
  FeatureFlag.deleteOne = async (filter) => { deletedName = filter.name; return { deletedCount: 1 }; };
  try {
    const res = response();
    await resetFeatureFlag({ params: { name: "daily_mixes" } }, res, () => {});
    assert.equal(res.statusCode, 200);
    assert.equal(deletedName, "daily_mixes");
    assert.equal(res.body.flag.source, "environment");
  } finally {
    FeatureFlag.deleteOne = original;
  }
});

