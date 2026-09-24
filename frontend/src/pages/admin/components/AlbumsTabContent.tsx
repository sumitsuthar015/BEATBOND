import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useMusicStore } from "@/stores/useMusicStore";
import { Library, Search } from "lucide-react";
import { useState } from "react";
import AlbumsTable from "./AlbumsTable";
import AddAlbumDialog from "./AddAlbumDialog";

const AlbumsTabContent = () => {
	const [search, setSearch] = useState("");
	const albumCount = useMusicStore((state) => state.albums.length);

	return (
		<Card>
			<CardHeader>
				<div className='flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between'>
					<div>
						<CardTitle className='flex items-center gap-2'>
							<Library className='size-5 text-emerald-600 dark:text-emerald-400' />
							Albums library
						</CardTitle>
						<CardDescription>
							{albumCount} {albumCount === 1 ? "album" : "albums"} in the catalogue
						</CardDescription>
					</div>
					<div className='flex w-full gap-2 sm:w-auto'>
						<div className='relative flex-1 sm:w-64'>
							<Search className='absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground' />
							<Input
								value={search}
								onChange={(event) => setSearch(event.target.value)}
								placeholder='Search title or artist'
								className='pl-9'
								aria-label='Search albums'
							/>
						</div>
						<AddAlbumDialog />
					</div>
				</div>
			</CardHeader>
			<CardContent>
				<AlbumsTable search={search} />
			</CardContent>
		</Card>
	);
};

export default AlbumsTabContent;
