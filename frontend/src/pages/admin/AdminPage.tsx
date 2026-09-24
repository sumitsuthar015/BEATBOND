import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { axiosInstance } from "@/lib/axios";
import { useAuthStore } from "@/stores/useAuthStore";
import { useMusicStore } from "@/stores/useMusicStore";
import { useQuery } from "@tanstack/react-query";
import { Album, LayoutDashboard, Loader2, Music, ShieldAlert, ShieldCheck, Users2 } from "lucide-react";
import { useEffect } from "react";
import { Link } from "react-router-dom";
import AlbumsTabContent from "./components/AlbumsTabContent";
import DashboardStats from "./components/DashboardStats";
import Header from "./components/Header";
import ModerationTabContent from "./components/ModerationTabContent";
import OverviewTab from "./components/OverviewTab";
import SongsTabContent from "./components/SongsTabContent";
import UsersTabContent from "./components/UsersTabContent";
import type { DashboardOverview } from "./types";
import "./admin.css";

const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

const tabs = [
	{ value: "overview", label: "Overview", icon: LayoutDashboard },
	{ value: "songs", label: "Songs", icon: Music },
	{ value: "albums", label: "Albums", icon: Album },
	{ value: "users", label: "Users", icon: Users2 },
	{ value: "moderation", label: "Moderation", icon: ShieldCheck },
];

const AdminPage = () => {
	const { isAdmin, isLoading } = useAuthStore();
	const { fetchAlbums, fetchSongs } = useMusicStore();

	const overview = useQuery<DashboardOverview>({
		queryKey: ["admin", "overview"],
		queryFn: async () => (await axiosInstance.get("/admin/overview", { params: { tz: timeZone } })).data,
		enabled: isAdmin,
		refetchInterval: 60_000,
	});

	useEffect(() => {
		if (!isAdmin) return;
		fetchAlbums();
		fetchSongs();
	}, [isAdmin, fetchAlbums, fetchSongs]);

	if (isLoading) {
		return (
			<div className='flex min-h-screen items-center justify-center bg-background text-muted-foreground'>
				<Loader2 className='size-6 animate-spin' aria-label='Checking access' />
			</div>
		);
	}

	if (!isAdmin) {
		return (
			<div className='flex min-h-screen flex-col items-center justify-center gap-3 bg-background p-6 text-center'>
				<ShieldAlert className='size-10 text-muted-foreground' />
				<h1 className='text-xl font-semibold'>Admins only</h1>
				<p className='max-w-sm text-sm text-muted-foreground'>
					This page is only available to the BeatBond admin account. Sign in with that account to continue.
				</p>
				<Button asChild variant='outline' className='mt-2'>
					<Link to='/'>Back to BeatBond</Link>
				</Button>
			</div>
		);
	}

	return (
		<div className='min-h-screen bg-muted/40 text-foreground dark:bg-background'>
			<div className='mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8'>
				<Header
					onRefresh={() => {
						overview.refetch();
						fetchSongs();
						fetchAlbums();
					}}
					isRefreshing={overview.isFetching}
					updatedAt={overview.data?.generatedAt}
				/>

				{overview.isError && (
					<div className='flex flex-col gap-3 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm sm:flex-row sm:items-center sm:justify-between'>
						<p>
							<span className='font-medium'>Couldn't load dashboard stats.</span>{" "}
							<span className='text-muted-foreground'>
								{(overview.error as any)?.response?.data?.message || "Check that the server and database are running."}
							</span>
						</p>
						<Button variant='outline' size='sm' onClick={() => overview.refetch()}>
							Try again
						</Button>
					</div>
				)}

				<DashboardStats data={overview.data} />

				<Tabs defaultValue='overview' className='space-y-4'>
					<div className='overflow-x-auto'>
						<TabsList className='h-auto w-max bg-muted p-1'>
							{tabs.map(({ value, label, icon: Icon }) => (
								<TabsTrigger
									key={value}
									value={value}
									className='gap-2 px-3 py-1.5 data-[state=active]:bg-card data-[state=active]:shadow-sm'
								>
									<Icon className='size-4' />
									{label}
								</TabsTrigger>
							))}
						</TabsList>
					</div>

					<TabsContent value='overview'>
						<OverviewTab data={overview.data} />
					</TabsContent>
					<TabsContent value='songs'>
						<SongsTabContent />
					</TabsContent>
					<TabsContent value='albums'>
						<AlbumsTabContent />
					</TabsContent>
					<TabsContent value='users'>
						<UsersTabContent />
					</TabsContent>
					<TabsContent value='moderation'>
						<ModerationTabContent />
					</TabsContent>
				</Tabs>
			</div>
		</div>
	);
};

export default AdminPage;
