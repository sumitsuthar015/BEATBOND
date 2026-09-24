import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipProps } from "recharts";
import { formatCount } from "../../format";
import type { HourlyPlays } from "../../types";

/** 0 -> "12 AM", 13 -> "1 PM". */
const hourLabel = (hour: number) => `${hour % 12 || 12} ${hour < 12 ? "AM" : "PM"}`;
const hourRange = (hour: number) => `${hourLabel(hour)} – ${hourLabel((hour + 1) % 24)}`;
const shortTick = (hour: number) => `${hour % 12 || 12}${hour < 12 ? "a" : "p"}`;

const HourTooltip = ({ active, payload }: TooltipProps<number, string>) => {
	if (!active || !payload?.length) return null;
	const { hour, plays } = payload[0].payload as HourlyPlays;
	return (
		<div className='rounded-lg border bg-popover px-3 py-2 text-sm shadow-md'>
			<p className='text-xs text-muted-foreground'>{hourRange(hour)}</p>
			<p className='mt-0.5 flex items-center gap-2'>
				<span className='h-0.5 w-3 rounded-full bg-[var(--viz-accent)]' aria-hidden />
				<span className='font-semibold'>{formatCount(plays)}</span>
				<span className='text-muted-foreground'>plays</span>
			</p>
		</div>
	);
};

const HourlyChart = ({ data, windowDays }: { data: HourlyPlays[]; windowDays: number }) => {
	const total = data.reduce((sum, row) => sum + row.plays, 0);
	const peak = data.reduce((best, row) => (row.plays > best.plays ? row : best), data[0] ?? { hour: 0, plays: 0 });

	return (
		<Card className='admin-viz'>
			<CardHeader className='pb-3'>
				<CardTitle className='text-base'>Peak listening hours</CardTitle>
				<CardDescription>
					{total ? `Busiest: ${hourRange(peak.hour)} · last ${windowDays} days` : `Plays by hour of day · last ${windowDays} days`}
				</CardDescription>
			</CardHeader>
			<CardContent>
				{total === 0 ? (
					<p className='py-8 text-center text-sm text-muted-foreground'>No plays recorded yet.</p>
				) : (
					<>
						<div className='h-[200px]' aria-hidden>
							<ResponsiveContainer width='100%' height='100%'>
								<BarChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }} barCategoryGap={2}>
									<CartesianGrid vertical={false} stroke='var(--viz-grid)' />
									<XAxis
										dataKey='hour'
										tickFormatter={shortTick}
										ticks={[0, 3, 6, 9, 12, 15, 18, 21]}
										tickLine={false}
										axisLine={{ stroke: "var(--viz-grid)" }}
										tick={{ fill: "var(--viz-axis)", fontSize: 12 }}
										tickMargin={6}
									/>
									<YAxis
										allowDecimals={false}
										tickLine={false}
										axisLine={false}
										width={32}
										tick={{ fill: "var(--viz-axis)", fontSize: 12 }}
										tickFormatter={(value: number) => formatCount(value)}
									/>
									<Tooltip cursor={{ fill: "var(--viz-accent-wash)" }} content={<HourTooltip />} />
									<Bar dataKey='plays' fill='var(--viz-accent)' radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false} />
								</BarChart>
							</ResponsiveContainer>
						</div>
						{/* Screen-reader equivalent of the chart. */}
						<table className='sr-only'>
							<caption>Plays by hour of day</caption>
							<thead>
								<tr>
									<th>Hour</th>
									<th>Plays</th>
								</tr>
							</thead>
							<tbody>
								{data.map((row) => (
									<tr key={row.hour}>
										<td>{hourRange(row.hour)}</td>
										<td>{row.plays}</td>
									</tr>
								))}
							</tbody>
						</table>
					</>
				)}
			</CardContent>
		</Card>
	);
};

export default HourlyChart;
