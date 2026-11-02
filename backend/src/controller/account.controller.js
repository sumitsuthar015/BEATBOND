import { clerkClient } from "@clerk/express";
import { User } from "../models/user.model.js";
import { ListeningActivity } from "../models/listeningActivity.model.js";
import { FriendRequest } from "../models/friendRequest.model.js";
import { Message } from "../models/message.model.js";
import { Playlist } from "../models/playlist.model.js";
import { Notification } from "../models/notification.model.js";
import { Comment } from "../models/comment.model.js";
import { Post } from "../models/post.model.js";
import { SearchHistory } from "../models/searchHistory.model.js";
import { SavedSearch } from "../models/savedSearch.model.js";
import { LikedArtist } from "../models/likedArtist.model.js";
import { PushSubscription } from "../models/pushSubscription.model.js";
import { UserLocation } from "../models/userLocation.model.js";
import { Avatar } from "../models/avatar.model.js";
import { Song } from "../models/song.model.js";
import { LikedSong } from "../models/likedSong.model.js";
import { GroupConversation } from "../models/groupConversation.model.js";
import { GroupMessage } from "../models/groupMessage.model.js";
import { PodcastSubscription } from "../models/podcastSubscription.model.js";
import { PodcastProgress } from "../models/podcastProgress.model.js";
import { ContentReport } from "../models/contentReport.model.js";
import cloudinary from "../lib/cloudinary.js";

const cloudinaryPublicId = (url) => {
  if (typeof url !== "string" || !url.includes("res.cloudinary.com/")) return null;
  const path = new URL(url).pathname;
  const uploadPath = path.split("/upload/")[1];
  if (!uploadPath) return null;
  const versionMatch = uploadPath.match(/(?:^|\/)v\d+\/(.+)$/);
  const assetPath = versionMatch?.[1] || uploadPath;
  return decodeURIComponent(assetPath).replace(/\.[^/.]+$/, "");
};

/** Creates a machine-readable export of the authenticated user's BeatBond data. */
export const exportMyData = async (req, res, next) => {
  try {
    const userId = req.auth().userId;
    const groups = await GroupConversation.find({ "members.userId": userId }).select("_id").lean();
    const groupIds = groups.map((group) => group._id);
    const [profile, listeningHistory, friendRequests, messages, playlists, notifications, comments, posts, searches, savedSearches, likedArtists, likedSongs, subscriptions, locations, avatar, groupMessages, podcastSubscriptions, podcastProgress, contentReports, storyInteractions] = await Promise.all([
      User.findOne({ clerkId: userId }).select("-__v -isOnline -lastSeen -currentActivity").lean(),
      ListeningActivity.find({ userId }).lean(),
      FriendRequest.find({ $or: [{ senderId: userId }, { receiverId: userId }] }).lean(),
      Message.find({ $or: [{ senderId: userId }, { receiverId: userId }] }).lean(),
      Playlist.find({ $or: [{ ownerId: userId }, { "collaborators.userId": userId }] }).lean(),
      Notification.find({ userId }).lean(),
      Comment.find({ userId }).lean(),
      Post.find({ authorId: userId }).lean(),
      SearchHistory.find({ userId }).lean(),
      SavedSearch.find({ userId }).lean(),
      LikedArtist.find({ userId }).lean(),
      LikedSong.find({ userId }).lean(),
      PushSubscription.find({ userId }).select("createdAt updatedAt").lean(),
      UserLocation.find({ userId }).lean(),
      Avatar.findOne({ userId }).lean(),
      groupIds.length ? GroupMessage.find({ conversationId: { $in: groupIds } }).lean() : [],
      PodcastSubscription.find({ userId }).lean(),
      PodcastProgress.find({ userId }).lean(),
      ContentReport.find({ $or: [{ reporterId: userId }, { targetAuthorId: userId }] }).lean(),
      Post.find({ $or: [{ "storyComments.userId": userId }, { "storyReactions.userId": userId }] }).select("_id storyComments storyReactions").lean(),
    ]);
    const payload = { exportedAt: new Date().toISOString(), account: profile, listeningHistory, friendRequests, directMessages: messages, playlists, notifications, comments, posts, storyInteractions, searches, savedSearches, likedArtists, likedSongs, pushSubscriptions: subscriptions, locations, avatar, groupMemberships: groups, groupMessages, podcastSubscriptions, podcastProgress, contentReports };
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="beatbond-data-${new Date().toISOString().slice(0, 10)}.json"`);
    res.json(payload);
  } catch (error) { next(error); }
};

/** Permanently removes the authenticated account and its account-owned records. */
export const deleteMyAccount = async (req, res) => {
  const userId = req.auth().userId;
  try {
    const [user, authoredPosts] = await Promise.all([
      User.findOne({ clerkId: userId }).select("photoUrl avatarImageUrl").lean(),
      Post.find({ authorId: userId }).select("media").lean(),
    ]);
    const mediaAssets = [
      { publicId: cloudinaryPublicId(user?.photoUrl), resource_type: "image" },
      { publicId: cloudinaryPublicId(user?.avatarImageUrl), resource_type: "image" },
      ...authoredPosts.map((post) => ({ publicId: post.media?.publicId, resource_type: post.media?.type === "video" ? "video" : "image" })),
    ].filter((asset) => asset.publicId);

    // Clean hosted media before removing the records. If the provider is
    // unavailable, keep the account intact so the user can safely retry.
    await Promise.all(mediaAssets.map(({ publicId, resource_type }) =>
      cloudinary.uploader.destroy(publicId, { resource_type }),
    ));

    // Remove records owned by the account and references to it from other users.
    await Promise.all([
      ListeningActivity.deleteMany({ userId }),
      FriendRequest.deleteMany({ $or: [{ senderId: userId }, { receiverId: userId }] }),
      Message.deleteMany({ $or: [{ senderId: userId }, { receiverId: userId }] }),
      Playlist.deleteMany({ ownerId: userId }),
      Notification.deleteMany({ userId }),
      Comment.deleteMany({ userId }),
      Post.deleteMany({ authorId: userId }),
      Post.updateMany(
        { $or: [{ "storyComments.userId": userId }, { "storyReactions.userId": userId }] },
        { $pull: { storyComments: { userId }, storyReactions: { userId } } },
      ),
      SearchHistory.deleteMany({ userId }),
      SavedSearch.deleteMany({ userId }),
      LikedArtist.deleteMany({ userId }),
      LikedSong.deleteMany({ userId }),
      PushSubscription.deleteMany({ userId }),
      UserLocation.deleteMany({ userId }),
      Avatar.deleteMany({ userId }),
      PodcastSubscription.deleteMany({ userId }),
      PodcastProgress.deleteMany({ userId }),
      ContentReport.deleteMany({ $or: [{ reporterId: userId }, { targetAuthorId: userId }] }),
      Song.updateMany({ likedBy: userId }, { $pull: { likedBy: userId } }),
      User.updateMany(
        { $or: [{ friends: userId }, { blockedUsers: userId }, { musicHiddenFrom: userId }, { mutedChats: userId }] },
        { $pull: { friends: userId, blockedUsers: userId, musicHiddenFrom: userId, mutedChats: userId } },
      ),
    ]);

    await User.deleteOne({ clerkId: userId });
    // Clerk owns credentials and sessions. Delete only after app data is gone,
    // while this request still carries a valid authenticated identity.
    await clerkClient.users.deleteUser(userId);
    res.status(204).end();
  } catch (error) {
    // Do not expose provider/database internals to the client.
    console.error("Account deletion failed:", error);
    res.status(500).json({ message: "Account deletion could not be completed. Contact support before trying again." });
  }
};
