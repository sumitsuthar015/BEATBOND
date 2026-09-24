import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useMusicStore } from "@/stores/useMusicStore";
import type { Song } from "@/types";
import { Heart } from "lucide-react";
import ConfirmDeleteButton from "./ConfirmDeleteButton";
import { formatCount, formatDuration } from "../format";

type AdminSong = Song & { likedBy?: string[] };

const SongsTable = ({ search }: { search: string }) => {
	const { songs, albums, isLoading, error, deleteSong } = useMusicStore();
	const albumTitles = new Map(albums.map((album) => [album._id, album.title]));
	const query = search.trim().toLowerCase();
	const visible = (songs as AdminSong[]).filter(
		(song) => !query || song.title.toLowerCase().includes(query) || song.artist.toLowerCase().includes(query)
	);

	// Other admin actions share the store's loading flag, so only show the
	// skeleton on the first load instead of blanking the table every time.
	if (isLoading && songs.length === 0) {
		return (
			<div className='space-y-2'>
				{Array.from({ length: 5 }, (_, i) => (
					<Skeleton key={i} className='h-12 w-full' />
				))}
			</div>
		);
	}

	if (error && songs.length === 0) {
		return <p className='py-10 text-center text-sm text-red-600 dark:text-red-400'>{error}</p>;
	}

	if (visible.length === 0) {
		return (
			<p className='py-10 text-center text-sm text-muted-foreground'>
				{query ? `No songs match "${search.trim()}".` : "No songs uploaded yet. Add your first one above."}
			</p>
		);
	}

	return (
		<Table>
			<TableHeader>
				<TableRow>
					<TableHead className='w-[52px]'>
						<span className='sr-only'>Cover</span>
					</TableHead>
					<TableHead>Title</TableHead>
					<TableHead className='hidden md:table-cell'>Album</TableHead>
					<TableHead className='hidden sm:table-cell text-right'>Length</TableHead>
					<TableHead className='hidden sm:table-cell text-right'>Likes</TableHead>
					<TableHead className='hidden lg:table-cell'>Added</TableHead>
					<TableHead className='text-right'>
						<span className='sr-only'>Actions</span>
					</TableHead>
				</TableRow>
			</TableHeader>

			<TableBody>
				{visible.map((song) => (
					<TableRow key={song._id}>
						<TableCell>
							<img src={song.imageUrl} alt='' className='size-10 rounded object-cover bg-muted' loading='lazy' />
						</TableCell>
						<TableCell>
							<p className='font-medium'>{song.title}</p>
							<p className='text-xs text-muted-foreground'>{song.artist}</p>
						</TableCell>
						<TableCell className='hidden md:table-cell text-muted-foreground'>
							{(song.albumId && albumTitles.get(song.albumId)) || "Single"}
						</TableCell>
						<TableCell className='hidden sm:table-cell text-right tabular-nums text-muted-foreground'>
							{formatDuration(song.duration)}
						</TableCell>
						<TableCell className='hidden sm:table-cell text-right tabular-nums text-muted-foreground'>
							<span className='inline-flex items-center gap-1'>
								<Heart className='size-3.5' aria-hidden />
								{formatCount(song.likedBy?.length || 0)}
							</span>
						</TableCell>
						<TableCell className='hidden lg:table-cell text-muted-foreground'>
							{song.createdAt ? new Date(song.createdAt).toLocaleDateString("en-IN", { dateStyle: "medium" }) : "—"}
						</TableCell>
						<TableCell className='text-right'>
							<ConfirmDeleteButton
								label={`Delete song ${song.title}`}
								title={`Delete "${song.title}"?`}
								description='The song will be removed from the catalogue and from its album. This cannot be undone.'
								onConfirm={() => deleteSong(song._id)}
							/>
						</TableCell>
					</TableRow>
				))}
			</TableBody>
		</Table>
	);
};

export default SongsTable;
