import { Notification } from "../models/notification.model.js";

export const getNotifications = async (req, res, next) => {
  try {
    const userId = req.auth.userId;
    
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const notifications = await Notification.find({ userId })
      .sort({ createdAt: -1 })
      .limit(50); 
    
    res.status(200).json(notifications);
  } catch (error) {
    console.error("Get notifications error:", error);
    next(error);
  }
};

export const markAsRead = async (req, res, next) => {
  try {
    const { notificationId } = req.params;
    const userId = req.auth.userId;

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    if (!notificationId) {
      return res.status(400).json({ error: "Notification ID is required" });
    }

    const notification = await Notification.findOneAndUpdate(
      { _id: notificationId, userId },
      { read: true },
      { new: true }
    );

    if (!notification) {
      return res.status(404).json({ error: "Notification not found" });
    }

    res.status(200).json({ 
      success: true, 
      notification 
    });
  } catch (error) {
    console.error("Mark as read error:", error);
    next(error);
  }
};

export const markAllAsRead = async (req, res, next) => {
  try {
    const userId = req.auth.userId;

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const result = await Notification.updateMany(
      { userId, read: false }, 
      { read: true }
    );

    res.status(200).json({ 
      success: true,
      modifiedCount: result.modifiedCount 
    });
  } catch (error) {
    console.error("Mark all as read error:", error);
    next(error);
  }
};

export const deleteNotification = async (req, res, next) => {
  try {
    const { notificationId } = req.params;
    const userId = req.auth.userId;

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    if (!notificationId) {
      return res.status(400).json({ error: "Notification ID is required" });
    }

    const result = await Notification.findOneAndDelete({ 
      _id: notificationId, 
      userId 
    });

    if (!result) {
      return res.status(404).json({ error: "Notification not found" });
    }

    res.status(200).json({ 
      success: true,
      deletedId: notificationId 
    });
  } catch (error) {
    console.error("Delete notification error:", error);
    next(error);
  }
};

export const clearAllNotifications = async (req, res, next) => {
  try {
    const userId = req.auth.userId;

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const result = await Notification.deleteMany({ userId });

    res.status(200).json({ 
      success: true,
      deletedCount: result.deletedCount 
    });
  } catch (error) {
    console.error("Clear all notifications error:", error);
    next(error);
  }
};