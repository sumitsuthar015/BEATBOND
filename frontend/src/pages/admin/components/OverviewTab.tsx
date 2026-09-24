import { Skeleton } from "@/components/ui/skeleton";
import ActivityChart from "./overview/ActivityChart";
import HourlyChart from "./overview/HourlyChart";
import ListeningHealth from "./overview/ListeningHealth";
import RankedList from "./overview/RankedList";
import RecentSignups from "./overview/RecentSignups";
import type { DashboardOverview } from "../types";

const OverviewTab = ({ data }: { data?: DashboardOverview }) => {
	if (!data) {
		return (
			<div className='grid grid-cols-1 gap-4 lg:grid-cols-3'>
				<Skeleton className='h-[360px] rounded-xl lg:col-span-2' />
				<Skeleton className='h-[360px] rounded-xl' />
				<Skeleton className='h-[320px] rounded-xl' />
				<Skeleton className='h-[320px] rounded-xl' />
				<Skeleton className='h-[320px] rounded-xl' />
			</div>
		);
	}

	return (
		<div className='grid grid-cols-1 gap-4 lg:grid-cols-3'>
			<div className='lg:col-span-2'>
				<ActivityChart data={data.daily} />
			</div>
			<ListeningHealth data={data} />

			<RankedList
				title='Top songs'
				description={`Most played in the last ${data.windowDays} days`}
				unit='plays'
				emptyText='No plays recorded yet.'
				items={data.topSongs.map((song) => ({
					key: song.songId,
					title: song.title,
					subtitle: song.artist,
					imageUrl: song.imageUrl,
					value: song.plays,
					detail: `${song.listeners} ${song.listeners === 1 ? "listener" : "listeners"}`,
				}))}
			/>
			<RankedList
				title='Top artists'
				description={`Most played in the last ${data.windowDays} days`}
				unit='plays'
				emptyText='No plays recorded yet.'
				items={data.topArtists.map((artist) => ({ key: artist.name, title: artist.name, value: artist.plays }))}
			/>
			<HourlyChart data={data.hourly} windowDays={data.windowDays} />

			<div className='lg:col-span-3'>
				<RecentSignups users={data.recentUsers} />
			</div>
		</div>
	);
};

export default OverviewTab;
