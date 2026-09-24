import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCount } from "../../format";

export type RankedItem = {
	key: string;
	title: string;
	subtitle?: string;
	imageUrl?: string;
	value: number;
	/** Extra detail read out on hover, e.g. "8 listeners". */
	detail?: string;
};

type RankedListProps = {
	title: string;
	description: string;
	items: RankedItem[];
	unit: string;
	emptyText: string;
};

/** A ranked table with a thin magnitude bar per row; the numbers stay visible as text. */
const RankedList = ({ title, description, items, unit, emptyText }: RankedListProps) => {
	const max = Math.max(...items.map((item) => item.value), 1);

	return (
		<Card className='admin-viz'>
			<CardHeader className='pb-3'>
				<CardTitle className='text-base'>{title}</CardTitle>
				<CardDescription>{description}</CardDescription>
			</CardHeader>
			<CardContent>
				{items.length === 0 ? (
					<p className='py-8 text-center text-sm text-muted-foreground'>{emptyText}</p>
				) : (
					<ol className='space-y-3'>
						{items.map((item, index) => (
							<li
								key={item.key}
								className='flex items-center gap-3'
								title={`${item.title}: ${formatCount(item.value)} ${unit}${item.detail ? ` · ${item.detail}` : ""}`}
							>
								<span className='w-4 shrink-0 text-right text-xs font-medium tabular-nums text-muted-foreground'>
									{index + 1}
								</span>
								{item.imageUrl !== undefined && (
									<img
										src={item.imageUrl || "/default-image.png"}
										alt=''
										className='size-9 shrink-0 rounded object-cover bg-muted'
										loading='lazy'
									/>
								)}
								<div className='min-w-0 flex-1'>
									<div className='flex items-baseline justify-between gap-3'>
										<p className='truncate text-sm font-medium'>{item.title}</p>
										<p className='shrink-0 text-sm font-semibold tabular-nums'>
											{formatCount(item.value)}
											<span className='sr-only'> {unit}</span>
										</p>
									</div>
									{item.subtitle && <p className='truncate text-xs text-muted-foreground'>{item.subtitle}</p>}
									<div className='mt-1.5 h-1.5 rounded-full bg-[var(--viz-track)]' aria-hidden>
										<div
											className='h-full rounded-full bg-[var(--viz-accent)]'
											style={{ width: `${Math.max((item.value / max) * 100, 2)}%` }}
										/>
									</div>
								</div>
							</li>
						))}
					</ol>
				)}
			</CardContent>
		</Card>
	);
};

export default RankedList;
