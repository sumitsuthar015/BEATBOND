import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useDebounce } from "@/hooks/useDebounce";
import { axiosInstance } from "@/lib/axios";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BadgeCheck, Loader2, Search, ShieldOff, UserRoundCheck } from "lucide-react";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";

interface AdminArtist {
	id: string;
	name: string;
	imageUrl: string;
	followerCount: number;
	providerVerified: boolean;
	isApproved: boolean;
}

interface AdminArtistsResponse {
	artists: AdminArtist[];
	approvedCount: number;
}

const formatFollowers = (count: number) => new Intl.NumberFormat(undefined, { notation: count >= 100_000 ? "compact" : "standard", maximumFractionDigits: 1 }).format(count || 0);

const ArtistsTabContent = () => {
	const [search, setSearch] = useState("");
	const debouncedSearch = useDebounce(search.trim(), 350);
	const queryClient = useQueryClient();
	const artistsQuery = useQuery<AdminArtistsResponse>({
		queryKey: ["admin", "artists", debouncedSearch],
		queryFn: async () => (await axiosInstance.get("/admin/artists", { params: { search: debouncedSearch } })).data,
	});

	const onSuccess = async (message: string) => {
		await queryClient.invalidateQueries({ queryKey: ["admin", "artists"] });
		toast.success(message);
	};
	const approve = useMutation({
		mutationFn: async (artist: AdminArtist) => axiosInstance.post("/admin/artists/verify", {
			artistId: artist.id,
			name: artist.name,
			imageUrl: artist.imageUrl,
			followerCount: artist.followerCount,
			providerVerified: artist.providerVerified,
		}),
		onSuccess: () => void onSuccess("Artist approved for search"),
		onError: () => toast.error("Could not approve artist"),
	});
	const removeApproval = useMutation({
		mutationFn: async (artistId: string) => axiosInstance.delete(`/admin/artists/${encodeURIComponent(artistId)}/verify`),
		onSuccess: () => void onSuccess("Artist removed from search"),
		onError: () => toast.error("Could not remove artist"),
	});

	useEffect(() => {
		if (artistsQuery.isError) toast.error("Couldn't load artists");
	}, [artistsQuery.isError]);

	const artists = artistsQuery.data?.artists || [];
	const busy = approve.isPending || removeApproval.isPending;

	return (
		<Card>
			<CardHeader>
				<div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
					<div>
						<CardTitle className="flex items-center gap-2">
							<BadgeCheck className="size-5 text-primary" />
							Artist verification
						</CardTitle>
						<CardDescription>
							{artistsQuery.data ? `${artistsQuery.data.approvedCount} approved artists appear in search` : "Search the catalogue and approve the artists users can discover."}
						</CardDescription>
					</div>
					<div className="relative w-full sm:w-80">
						<Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
						<Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search artist catalogue" className="pl-9" aria-label="Search artists to verify" />
					</div>
				</div>
			</CardHeader>
			<CardContent>
				{artistsQuery.isLoading ? (
					<div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />Loading artists…</div>
				) : artistsQuery.isError ? (
					<div className="py-10 text-center">
						<p className="text-sm text-muted-foreground">Artist list couldn't load.</p>
						<Button className="mt-3" variant="outline" size="sm" onClick={() => void artistsQuery.refetch()}>Try again</Button>
					</div>
				) : !artists.length ? (
					<div className="py-12 text-center text-sm text-muted-foreground">
						{debouncedSearch.length < 2 ? "Search by artist name to add an artist. Approved artists are listed here when the search is empty." : `No artists found for “${debouncedSearch}”.`}
					</div>
				) : (
					<div className="divide-y rounded-xl border">
						{artists.map((artist) => (
							<div key={artist.id} className="flex min-w-0 items-center gap-3 p-3 sm:gap-4">
								<Avatar className="size-12 shrink-0"><AvatarImage src={artist.imageUrl} alt="" /><AvatarFallback><UserRoundCheck className="size-5" /></AvatarFallback></Avatar>
								<div className="min-w-0 flex-1">
									<p className="truncate font-semibold">{artist.name}</p>
									<p className="text-xs text-muted-foreground">{artist.followerCount ? `${formatFollowers(artist.followerCount)} followers` : "Artist profile"}</p>
								</div>
								<div className="flex shrink-0 items-center gap-2">
									{artist.isApproved ? (
										<>
											<Badge variant="secondary" className="hidden gap-1 sm:inline-flex"><BadgeCheck className="size-3.5" />Approved</Badge>
											<Button variant="outline" size="sm" disabled={busy} onClick={() => removeApproval.mutate(artist.id)} aria-label={`Remove ${artist.name} from search`}><ShieldOff className="mr-1 size-4" />Remove</Button>
										</>
									) : (
										<Button size="sm" disabled={busy} onClick={() => approve.mutate(artist)} aria-label={`Approve ${artist.name}`}><BadgeCheck className="mr-1 size-4" />Verify</Button>
									)}
								</div>
							</div>
						))}
					</div>
				)}
			</CardContent>
		</Card>
	);
};

export default ArtistsTabContent;
