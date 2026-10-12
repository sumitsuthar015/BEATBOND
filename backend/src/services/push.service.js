import webpush from "web-push";
import { PushSubscription } from "../models/pushSubscription.model.js";

const getVapidConfig = () => ({
  publicKey: process.env.VAPID_PUBLIC_KEY || "",
  privateKey: process.env.VAPID_PRIVATE_KEY || "",
});

export const getVapidPublicKey = () => getVapidConfig().publicKey;

export const savePushSubscription = async (userId, subscription) => {
  if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
    throw new Error("Invalid push subscription");
  }
  return PushSubscription.findOneAndUpdate(
    { endpoint: subscription.endpoint },
    { userId, endpoint: subscription.endpoint, keys: subscription.keys },
    { upsert: true, new: true, runValidators: true },
  );
};

export const removePushSubscription = (userId, endpoint) =>
  PushSubscription.deleteOne({ userId, endpoint });

export const sendPushToUser = async (userId, payload) => {
  const { publicKey, privateKey } = getVapidConfig();
  if (!publicKey || !privateKey) return;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:support@beatbond.app", publicKey, privateKey);
  const subscriptions = await PushSubscription.find({ userId }).lean();
  await Promise.all(subscriptions.map(async (subscription) => {
    try {
      await webpush.sendNotification(subscription, JSON.stringify(payload));
    } catch (error) {
      if (error.statusCode === 404 || error.statusCode === 410) {
        await PushSubscription.deleteOne({ _id: subscription._id });
      } else {
        console.error("Unable to send push notification:", error.message);
      }
    }
  }));
};
