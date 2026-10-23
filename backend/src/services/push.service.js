import webpush from "web-push";
import { PushSubscription } from "../models/pushSubscription.model.js";

const getVapidConfig = () => ({
  publicKey: process.env.VAPID_PUBLIC_KEY || "",
  privateKey: process.env.VAPID_PRIVATE_KEY || "",
});

export const getVapidPublicKey = () => getVapidConfig().publicKey;

export const savePushSubscription = async (userId, subscription) => {
  const endpoint = typeof subscription?.endpoint === "string" ? subscription.endpoint : "";
  let hostname = "";
  try {
    const parsed = new URL(endpoint);
    hostname = parsed.hostname.toLowerCase();
    if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.port) hostname = "";
  } catch {}
  const supportedPushHost = hostname === "fcm.googleapis.com"
    || hostname === "updates.push.services.mozilla.com"
    || hostname.endsWith(".push.services.mozilla.com")
    || hostname === "web.push.apple.com"
    || hostname.endsWith(".notify.windows.com");
  if (!supportedPushHost || endpoint.length > 2_048
    || typeof subscription?.keys?.p256dh !== "string" || subscription.keys.p256dh.length < 80 || subscription.keys.p256dh.length > 100
    || typeof subscription?.keys?.auth !== "string" || subscription.keys.auth.length < 20 || subscription.keys.auth.length > 30) {
    throw new Error("Invalid push subscription");
  }
  const existing = await PushSubscription.findOne({ endpoint }).select("userId").lean();
  if (existing && existing.userId !== userId) {
    const error = new Error("This push subscription is already registered to another account.");
    error.status = 409;
    throw error;
  }
  return PushSubscription.findOneAndUpdate(
    { endpoint },
    { userId, endpoint, keys: { p256dh: subscription.keys.p256dh, auth: subscription.keys.auth } },
    { upsert: true, new: true, runValidators: true },
  );
};

export const removePushSubscription = (userId, endpoint) =>
  PushSubscription.deleteOne({ userId, endpoint });

export const sendPushToUser = async (userId, payload) => {
  const { publicKey, privateKey } = getVapidConfig();
  if (!publicKey || !privateKey) {
    console.error("Web Push is not configured; set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY.");
    return;
  }
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:support@beatbond.app", publicKey, privateKey);
  const subscriptions = await PushSubscription.find({ userId }).lean();
  if (!subscriptions.length) {
    console.warn("No Web Push subscription is saved for the message recipient.");
    return;
  }
  await Promise.all(subscriptions.map(async (subscription) => {
    try {
      await webpush.sendNotification(subscription, JSON.stringify(payload));
    } catch (error) {
      if (error.statusCode === 404 || error.statusCode === 410) {
        await PushSubscription.deleteOne({ _id: subscription._id });
      } else {
        console.error(
          `Unable to send push notification${error.statusCode ? ` (HTTP ${error.statusCode})` : ""}:`,
          error.message,
        );
      }
    }
  }));
};
