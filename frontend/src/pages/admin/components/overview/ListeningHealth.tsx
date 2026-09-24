import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCount, formatDuration } from "../../format";
import type { DashboardOverview } from "../../types";

const Meter = ({ label, value, caption }: { label: string; value: number; caption: string }) => (
	<div>
		<div className='flex items-baseline justify-between'>
			<p className='text-sm font-medium'>{label}</p>
			<p className='text-lg font-semibold'>{value}%</p>
		</div>
		<div
			className='mt-1.5 h-2 rounded-full bg-[var(--viz-track)]'
			role='meter'
			aria-label={label}
			aria-valuenow={value}
			aria-valuemin={0}
			aria-valuemax={100}
		>
			<div className='h-full rounded-full bg-[var(--viz-accent)]' style={{ width: `${Math.min(value, 100)}%` }} />
		</div>
		<p className='mt-1 text-xs text-muted-foreground'>{caption}</p>
	</div>
);

const ListeningHealth = ({ data }: { data: DashboardOverview }) => {
	const { listening, windowDays } = data;

	return (
		<Card className='admin-viz'>
			<CardHeader className='pb-3'>
				<CardTitle className='text-base'>Listening quality</CardTitle>
				<CardDescription>How people listened in the last {windowDays} days</CardDescription>
			</CardHeader>
			<CardContent className='space-y-5'>
				<Meter label='Completion rate' value={listening.completionRate} caption='Plays that reached the end of the song' />
				<Meter label='Skip rate' value={listening.skipRate} caption='Plays skipped before the end (lower is better)' />
				<div className='grid grid-cols-2 gap-3 border-t pt-4'>
					<div>
						<p className='text-xs text-muted-foreground'>Avg. listen per play</p>
						<p className='text-lg font-semibold'>{formatDuration(listening.avgSecondsPlayed)}</p>
					</div>
					<div>
						<p className='text-xs text-muted-foreground'>Plays counted</p>
						<p className='text-lg font-semibold'>{formatCount(listening.plays)}</p>
					</div>
				</div>
			</CardContent>
		</Card>
	);
};

export default ListeningHealth;
