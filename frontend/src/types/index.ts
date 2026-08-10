export interface Song {
	id?: string | null;
	artists?: any;
	image?: any;
	name?: string;
	videoUrl: string | null;
	genre: string;
	playedAt: string;
	userId: string | undefined;
	_id: string;
	title: string;
	artist: string;
	albumId?: string;
	albumName?: string;
	albumTitle?: string;
	language?: string;
	releaseYear?: number;
	imageUrl: string;
	audioUrl: string;
	/** Alternate stream qualities used when a CDN rejects the preferred source. */
	audioFallbackUrls?: string[];
	url?: string;
	duration: number;
	isLiked?: boolean;
	lyrics?: string;
	lyricsId?: string;
	createdAt: string;
	updatedAt: string;
	// Advanced search filter fields
	year?: number;
	explicit?: boolean;
	mood?: string;
	tags?: string[];
	playCount?: number;
}

export interface Album {
	_id: string;
	id: string;                 // Saavn album id
	name: string;               // Album / Movie name
	title: string;              // Same as name (for compatibility)
	description?: string;
	year: number;               // Release year as number
	releaseYear?: number;       // Optional alternate field
	artist: string;             // Artist name as string
	imageUrl: string;           // Main image URL
	image?: {                   // Optional image array from Saavn
		quality: string;
		url: string;
	}[];
	url?: string;               // Saavn album page
	songCount: number;          // Number of songs in album (required)
	songs: Song[];              // Array of songs in the album
}

// Artist interface for search results/grid
export interface Artist {
	id: string;
	name: string;
	role: string;
	image: Array<{ quality: string; url: string }>;
	imageUrl: string;
	type: string;
	url: string;
	topSongs?: Song[];
}

// Detailed artist interface for artist page
export interface ArtistDetail {
	id: string;
	name: string;
	image: Array<{ quality: string; url: string }>;
	followerCount?: number;
	fanCount?: string;
	isVerified?: boolean;
	dominantLanguage?: string;
	dominantType?: string;
	bio?: string;
	topSongs?: Song[];
	topAlbums?: Album[];
}

export interface Stats {
	totalSongs: number;
	totalAlbums: number;
	totalUsers: number;
	totalArtists: number;
}

export interface Message {
	_id: string;
	senderId: string;
	receiverId: string;
	content: string;
	createdAt: string;
	updatedAt: string;
}

export interface User {
	_id: string;
	clerkId: string;
	fullName: string;
	imageUrl: string;
	username?: string;
	email?: string;
	isOnline?: boolean;
	lastSeen?: Date;
	// Music activity fields
	musicPrivacy?: 'everyone' | 'friends' | 'none';
	currentActivity?: string | null;
	canSeeMusicActivity?: boolean;
}

export interface MusicPrivacySetting {
	value: 'everyone' | 'friends' | 'none';
	label: string;
	description: string;
}

export interface Location {
	userId: string;
	latitude: number;
	longitude: number;
	lastUpdated: Date;
}

export interface Friend {
	_id: string;
	userId: string;
	friendId: string;
	status: 'pending' | 'accepted' | 'rejected';
	createdAt: Date;
	updatedAt: Date;
}

export interface UserLocation {
	user: {
		_id: string;
		name: string;
		image?: string;
	};
	location: Location;
}
