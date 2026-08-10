import { Album } from "../models/album.model.js";

const fallbackAlbums = [
	{
		_id: "fallback-urban-nights",
		title: "Urban Nights",
		artist: "Various Artists",
		imageUrl: "/albums/1.jpg",
		releaseYear: 2024,
		songs: [
			{ _id: "fallback-song-1", title: "City Rain", artist: "Urban Echo", imageUrl: "/cover-images/7.jpg", audioUrl: "/songs/7.mp3", duration: 39 },
			{ _id: "fallback-song-2", title: "Neon Lights", artist: "Night Runners", imageUrl: "/cover-images/5.jpg", audioUrl: "/songs/5.mp3", duration: 36 },
			{ _id: "fallback-song-3", title: "Urban Jungle", artist: "City Lights", imageUrl: "/cover-images/15.jpg", audioUrl: "/songs/15.mp3", duration: 36 },
			{ _id: "fallback-song-4", title: "Neon Dreams", artist: "Cyber Pulse", imageUrl: "/cover-images/13.jpg", audioUrl: "/songs/13.mp3", duration: 39 },
		],
	},
	{
		_id: "fallback-coastal-dreaming",
		title: "Coastal Dreaming",
		artist: "Various Artists",
		imageUrl: "/albums/2.jpg",
		releaseYear: 2024,
		songs: [
			{ _id: "fallback-song-5", title: "Summer Daze", artist: "Coastal Kids", imageUrl: "/cover-images/4.jpg", audioUrl: "/songs/4.mp3", duration: 24 },
			{ _id: "fallback-song-6", title: "Ocean Waves", artist: "Coastal Drift", imageUrl: "/cover-images/9.jpg", audioUrl: "/songs/9.mp3", duration: 28 },
			{ _id: "fallback-song-7", title: "Crystal Rain", artist: "Echo Valley", imageUrl: "/cover-images/16.jpg", audioUrl: "/songs/16.mp3", duration: 39 },
			{ _id: "fallback-song-8", title: "Starlight", artist: "Luna Bay", imageUrl: "/cover-images/10.jpg", audioUrl: "/songs/10.mp3", duration: 30 },
		],
	},
	{
		_id: "fallback-midnight-sessions",
		title: "Midnight Sessions",
		artist: "Various Artists",
		imageUrl: "/albums/3.jpg",
		releaseYear: 2024,
		songs: [
			{ _id: "fallback-song-9", title: "Stay With Me", artist: "Sarah Mitchell", imageUrl: "/cover-images/1.jpg", audioUrl: "/songs/1.mp3", duration: 46 },
			{ _id: "fallback-song-10", title: "Midnight Drive", artist: "The Wanderers", imageUrl: "/cover-images/2.jpg", audioUrl: "/songs/2.mp3", duration: 41 },
			{ _id: "fallback-song-11", title: "Moonlight Dance", artist: "Silver Shadows", imageUrl: "/cover-images/14.jpg", audioUrl: "/songs/14.mp3", duration: 27 },
		],
	},
	{
		_id: "fallback-eastern-dreams",
		title: "Eastern Dreams",
		artist: "Various Artists",
		imageUrl: "/albums/4.jpg",
		releaseYear: 2024,
		songs: [
			{ _id: "fallback-song-12", title: "Lost in Tokyo", artist: "Electric Dreams", imageUrl: "/cover-images/3.jpg", audioUrl: "/songs/3.mp3", duration: 24 },
			{ _id: "fallback-song-13", title: "Neon Tokyo", artist: "Future Pulse", imageUrl: "/cover-images/17.jpg", audioUrl: "/songs/17.mp3", duration: 39 },
			{ _id: "fallback-song-14", title: "Purple Sunset", artist: "Dream Valley", imageUrl: "/cover-images/12.jpg", audioUrl: "/songs/12.mp3", duration: 17 },
		],
	},
];

const serializeAlbum = (album) => ({
	_id: album?._id?.toString?.() ?? album?.id ?? "",
	title: album?.title || album?.name || "Untitled album",
	artist: album?.artist || "Various Artists",
	imageUrl: album?.imageUrl || album?.image || "",
	releaseYear: album?.releaseYear || album?.year || 2024,
	songs: (album?.songs || []).map((song) => ({
		_id: song?._id?.toString?.() ?? song?.id ?? "",
		title: song?.title || "Untitled song",
		artist: song?.artist || album?.artist || "Unknown Artist",
		imageUrl: song?.imageUrl || "",
		audioUrl: song?.audioUrl || "",
		duration: song?.duration || 0,
		albumId: song?.albumId || album?._id?.toString?.() || album?.id || "",
	})),
});

export const getAllAlbums = async (req, res, next) => {
	try {
		const albums = await Album.find();
		const payload = albums?.length ? albums.map(serializeAlbum) : fallbackAlbums.map(serializeAlbum);
		res.status(200).json(payload);
	} catch (error) {
		console.error("Album fetch error:", error);
		res.status(200).json(fallbackAlbums.map(serializeAlbum));
	}
};

export const getAlbumById = async (req, res, next) => {
	try {
		const { albumId } = req.params;

		const album = await Album.findById(albumId).populate("songs");

		if (!album) {
			const fallbackAlbum = fallbackAlbums.find((item) => item._id === albumId);
			return res.status(200).json(fallbackAlbum ? serializeAlbum(fallbackAlbum) : serializeAlbum(fallbackAlbums[0]));
		}

		res.status(200).json(serializeAlbum(album));
	} catch (error) {
		console.error("Album detail fetch error:", error);
		const fallbackAlbum = fallbackAlbums.find((item) => item._id === req.params.albumId);
		res.status(200).json(fallbackAlbum ? serializeAlbum(fallbackAlbum) : serializeAlbum(fallbackAlbums[0]));
	}
};
