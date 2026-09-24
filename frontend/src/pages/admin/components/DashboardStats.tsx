import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
	Disc3,
	Headphones,
	Library,
	ListMusic,
	MessageCircle,
	MessagesSquare,
	Mic2,
	PlayCircle,
	Radio,
	Users2,
} from "lucide-react";
import StatsCard from "./StatsCard";
import { formatCount, weekOverWeek } from "../format";
import type { DashboardOverview } from "../types";

const DashboardStats = ({ data }: { data?: DashboardOverview }) => {
	if (!data) {
		return (
			<div className='space-y-4'>
				<div className='grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4'>
					{Array.from({ length: 4 }, (_, i) => (
						<Skeleton key={i} className='h-[132px] rounded-xl' />
					))}
				</div>
				<Skeleton className='h-[76px] rounded-xl' />
			</div>
		);
	}

	const { users, plays, listening, catalogue, community } = data;

	const inventory = [
		{ icon: ListMusic, label: "Songs", value: catalogue.songs },
		{ icon: Library, label: "Albums", value: catalogue.albums },
		{ icon: Mic2, label: "Artists", value: catalogue.artists },
		{ icon: Disc3, label: "Playlists", value: community.playlists },
		{ icon: MessageCircle, label: "Comments", value: community.comments },
		{ icon: MessagesSquare, label: "Messages", value: community.messages },
	];

	return (
		<div className='space-y-4'>
			<div className='grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4'>
				<StatsCard
					icon={Users2}
					label='Total users'
					value={formatCount(users.total)}
					hint={`+${formatCount(users.new7d)} joined this week (${formatCount(users.newPrev7d)} last week)`}
				/>
				<StatsCard
					icon={Radio}
					label='Online now'
					value={formatCount(users.onlineNow)}
					hint={`${formatCount(users.listeners7d)} people listened this week`}
				/>
				<StatsCard
					icon={PlayCircle}
					label='Plays this week'
					value={formatCount(plays.last7d)}
					trend={weekOverWeek(plays.last7d, plays.prev7d)}
				/>
				<StatsCard
					icon={Headphones}
					label='Hours listened'
					value={formatCount(listening.hoursPlayed)}
					hint={`Last ${data.windowDays} days · ${formatCount(plays.total)} plays all time`}
				/>
			</div>

			<Card className='grid grid-cols-2 gap-px overflow-hidden bg-border sm:grid-cols-3 lg:grid-cols-6'>
				{inventory.map(({ icon: Icon, label, value }) => (
					<div key={label} className='flex items-center gap-3 bg-card px-4 py-3'>
						<Icon className='size-4 shrink-0 text-muted-foreground' aria-hidden />
						<div className='min-w-0'>
							<p className='text-xs text-muted-foreground'>{label}</p>
							<p className='text-base font-semibold'>{formatCount(value)}</p>
						</div>
					</div>
				))}
			</Card>
		</div>
	);
};

export default DashboardStats;
