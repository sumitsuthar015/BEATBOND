export interface DailyActivity {
	date: string;
	plays: number;
	signups: number;
}

export interface TopSong {
	songId: string;
	title: string;
	artist: string;
	imageUrl: string;
	plays: number;
	listeners: number;
}

export interface NamedCount {
	name: string;
	plays: number;
}

export interface HourlyPlays {
	/** 0-23 in the admin's timezone. */
	hour: number;
	plays: number;
}

export interface RecentUser {
	_id: string;
	fullName: string;
	username: string;
	imageUrl: string;
	createdAt: string;
	isOnline: boolean;
}

export interface DashboardOverview {
	generatedAt: string;
	timeZone: string;
	windowDays: number;
	users: { total: number; new7d: number; newPrev7d: number; onlineNow: number; listeners7d: number };
	plays: { total: number; last7d: number; prev7d: number };
	catalogue: { songs: number; albums: number; artists: number };
	community: { comments: number; messages: number; playlists: number };
	daily: DailyActivity[];
	topSongs: TopSong[];
	topArtists: NamedCount[];
	hourly: HourlyPlays[];
	listening: {
		plays: number;
		completionRate: number;
		skipRate: number;
		avgSecondsPlayed: number;
		hoursPlayed: number;
	};
	recentUsers: RecentUser[];
}

export interface AdminUser {
	_id: string;
	fullName: string;
	username: string;
	email: string;
	imageUrl: string;
	createdAt: string;
	lastSeen: string | null;
	isOnline: boolean;
	friendsCount: number;
	plays: number;
	lastPlayedAt: string | null;
}

export interface AdminUsersPage {
	total: number;
	page: number;
	pages: number;
	users: AdminUser[];
}

export interface ContentAuthor {
	fullName: string;
	username: string;
	imageUrl: string;
}

export interface ModerationComment {
	_id: string;
	content: string;
	songTitle: string;
	songArtist: string;
	songImageUrl: string;
	createdAt: string;
	author: ContentAuthor;
}

export interface ModerationFeed {
	comments: ModerationComment[];
}
