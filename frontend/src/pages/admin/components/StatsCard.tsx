import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import type { Trend } from "../format";

type StatsCardProps = {
	icon: React.ElementType;
	label: string;
	value: string;
	/** Secondary line under the value, e.g. "12 listened this week". */
	hint?: string;
	trend?: Trend;
};

const trendStyles = {
	up: { icon: ArrowUpRight, className: "text-emerald-700 dark:text-emerald-400" },
	down: { icon: ArrowDownRight, className: "text-red-600 dark:text-red-400" },
	flat: { icon: Minus, className: "text-muted-foreground" },
};

const StatsCard = ({ icon: Icon, label, value, hint, trend }: StatsCardProps) => {
	const TrendIcon = trend ? trendStyles[trend.direction].icon : null;

	return (
		<Card className='transition-colors hover:border-emerald-500/40'>
			<CardContent className='p-5'>
				<div className='flex items-start justify-between gap-3'>
					<p className='text-sm font-medium text-muted-foreground'>{label}</p>
					<div className='rounded-lg bg-emerald-500/10 p-2'>
						<Icon className='size-4 text-emerald-600 dark:text-emerald-400' aria-hidden />
					</div>
				</div>
				<p className='mt-2 text-3xl font-semibold tracking-tight'>{value}</p>
				{trend && TrendIcon ? (
					<p className={cn("mt-1 flex items-center gap-1 text-xs font-medium", trendStyles[trend.direction].className)}>
						<TrendIcon className='size-3.5' aria-hidden />
						{trend.text}
					</p>
				) : (
					hint && <p className='mt-1 text-xs text-muted-foreground'>{hint}</p>
				)}
			</CardContent>
		</Card>
	);
};

export default StatsCard;
