import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useMusicStore } from "@/stores/useMusicStore";
import ConfirmDeleteButton from "./ConfirmDeleteButton";

// The API serves built-in sample albums when the database has none; they can't be deleted.
const isSampleAlbum = (id: string) => id.startsWith("fallback-");

const AlbumsTable = ({ search }: { search: string }) => {
	const { albums, albumsLoading, deleteAlbum } = useMusicStore();
	const query = search.trim().toLowerCase();
	const visible = albums.filter(
		(album) => !query || album.title?.toLowerCase().includes(query) || album.artist?.toLowerCase().includes(query)
	);

	if (albumsLoading && albums.length === 0) {
		return (
			<div className='space-y-2'>
				{Array.from({ length: 4 }, (_, i) => (
					<Skeleton key={i} className='h-12 w-full' />
				))}
			</div>
		);
	}

	if (visible.length === 0) {
		return (
			<p className='py-10 text-center text-sm text-muted-foreground'>
				{query ? `No albums match "${search.trim()}".` : "No albums yet. Create your first one above."}
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
					<TableHead className='hidden sm:table-cell'>Released</TableHead>
					<TableHead className='text-right'>Songs</TableHead>
					<TableHead className='text-right'>
						<span className='sr-only'>Actions</span>
					</TableHead>
				</TableRow>
			</TableHeader>
			<TableBody>
				{visible.map((album) => {
					const songCount = album.songs?.length || 0;
					return (
						<TableRow key={album._id}>
							<TableCell>
								<img src={album.imageUrl} alt='' className='size-10 rounded object-cover bg-muted' loading='lazy' />
							</TableCell>
							<TableCell>
								<p className='flex items-center gap-2 font-medium'>
									{album.title}
									{isSampleAlbum(album._id) && (
										<Badge variant='secondary' className='font-normal'>
											Sample
										</Badge>
									)}
								</p>
								<p className='text-xs text-muted-foreground'>{album.artist}</p>
							</TableCell>
							<TableCell className='hidden sm:table-cell text-muted-foreground'>{album.releaseYear || album.year}</TableCell>
							<TableCell className='text-right tabular-nums text-muted-foreground'>{songCount}</TableCell>
							<TableCell className='text-right'>
								{!isSampleAlbum(album._id) && (
									<ConfirmDeleteButton
										label={`Delete album ${album.title}`}
										title={`Delete "${album.title}"?`}
										description={
											songCount
												? `This also deletes the ${songCount} ${songCount === 1 ? "song" : "songs"} in this album. This cannot be undone.`
												: "The album will be removed from the catalogue. This cannot be undone."
										}
										onConfirm={() => deleteAlbum(album._id)}
									/>
								)}
							</TableCell>
						</TableRow>
					);
				})}
			</TableBody>
		</Table>
	);
};

export default AlbumsTable;
