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
      SearchHistory.deleteMany({ userId }),
      SavedSearch.deleteMany({ userId }),
      LikedArtist.deleteMany({ userId }),
      PushSubscription.deleteMany({ userId }),
      UserLocation.deleteMany({ userId }),
      Avatar.deleteMany({ userId }),
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
