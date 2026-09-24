import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { BarChart3, TableIcon } from "lucide-react";
import { useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipProps } from "recharts";
import { formatCount, formatDayLabel } from "../../format";
import type { DailyActivity } from "../../types";

type Metric = "plays" | "signups";

const metrics: Record<Metric, { label: string; unit: string }> = {
	plays: { label: "Plays", unit: "plays" },
	signups: { label: "Sign-ups", unit: "new users" },
};

const ChartTooltip = ({ active, payload, label, metric }: TooltipProps<number, string> & { metric: Metric }) => {
	if (!active || !payload?.length) return null;
	return (
		<div className='rounded-lg border bg-popover px-3 py-2 text-sm shadow-md'>
			<p className='text-xs text-muted-foreground'>{formatDayLabel(String(label))}</p>
			<p className='mt-0.5 flex items-center gap-2'>
				<span className='h-0.5 w-3 rounded-full bg-[var(--viz-accent)]' aria-hidden />
				<span className='font-semibold'>{formatCount(Number(payload[0].value) || 0)}</span>
				<span className='text-muted-foreground'>{metrics[metric].unit}</span>
			</p>
		</div>
	);
};

const ActivityChart = ({ data }: { data: DailyActivity[] }) => {
	const [metric, setMetric] = useState<Metric>("plays");
	const [showTable, setShowTable] = useState(false);
	const total = data.reduce((sum, day) => sum + day[metric], 0);

	return (
		<Card className='admin-viz'>
			<CardHeader className='flex flex-col gap-3 space-y-0 pb-2 sm:flex-row sm:items-start sm:justify-between'>
				<div>
					<CardTitle className='text-base'>Daily activity</CardTitle>
					<CardDescription>
						{formatCount(total)} {metrics[metric].unit} in the last {data.length} days
					</CardDescription>
				</div>
				<div className='flex items-center gap-2'>
					<div className='inline-flex rounded-lg bg-muted p-0.5' role='group' aria-label='Chart metric'>
						{(Object.keys(metrics) as Metric[]).map((key) => (
							<button
								key={key}
								type='button'
								onClick={() => setMetric(key)}
								aria-pressed={metric === key}
								className={cn(
									"rounded-md px-3 py-1 text-xs font-medium transition-colors",
									metric === key ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
								)}
							>
								{metrics[key].label}
							</button>
						))}
					</div>
					<Button
						variant='outline'
						size='sm'
						className='h-7 px-2 text-xs'
						onClick={() => setShowTable((value) => !value)}
						aria-pressed={showTable}
					>
						{showTable ? <BarChart3 className='size-3.5' /> : <TableIcon className='size-3.5' />}
						{showTable ? "Chart" : "Table"}
					</Button>
				</div>
			</CardHeader>
			<CardContent className='pt-2'>
				{showTable ? (
					<div className='max-h-[260px] overflow-auto'>
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Day</TableHead>
									<TableHead className='text-right'>Plays</TableHead>
									<TableHead className='text-right'>Sign-ups</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody className='tabular-nums'>
								{[...data].reverse().map((day) => (
									<TableRow key={day.date}>
										<TableCell>{formatDayLabel(day.date)}</TableCell>
										<TableCell className='text-right'>{formatCount(day.plays)}</TableCell>
										<TableCell className='text-right'>{formatCount(day.signups)}</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					</div>
				) : (
					<div className='h-[260px]' role='img' aria-label={`${metrics[metric].label} per day for the last ${data.length} days`}>
						<ResponsiveContainer width='100%' height='100%'>
							<AreaChart data={data} margin={{ top: 8, right: 24, left: 0, bottom: 0 }}>
								<CartesianGrid vertical={false} stroke='var(--viz-grid)' />
								<XAxis
									dataKey='date'
									tickFormatter={formatDayLabel}
									tickLine={false}
									axisLine={{ stroke: "var(--viz-grid)" }}
									tick={{ fill: "var(--viz-axis)", fontSize: 12 }}
									minTickGap={24}
									tickMargin={8}
								/>
								<YAxis
									allowDecimals={false}
									tickLine={false}
									axisLine={false}
									width={36}
									tick={{ fill: "var(--viz-axis)", fontSize: 12 }}
									tickFormatter={(value: number) => formatCount(value)}
								/>
								<Tooltip
									cursor={{ stroke: "var(--viz-axis)", strokeWidth: 1 }}
									content={<ChartTooltip metric={metric} />}
								/>
								<Area
									type='monotone'
									dataKey={metric}
									stroke='var(--viz-accent)'
									strokeWidth={2}
									fill='var(--viz-accent-wash)'
									fillOpacity={1}
									dot={false}
									activeDot={{ r: 5, fill: "var(--viz-accent)", stroke: "hsl(var(--card))", strokeWidth: 2 }}
									isAnimationActive={false}
								/>
							</AreaChart>
						</ResponsiveContainer>
					</div>
				)}
			</CardContent>
		</Card>
	);
};

export default ActivityChart;
