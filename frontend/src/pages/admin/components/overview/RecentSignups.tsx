import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDistanceToNow } from "date-fns";
import type { RecentUser } from "../../types";

const RecentSignups = ({ users }: { users: RecentUser[] }) => (
	<Card>
		<CardHeader className='pb-3'>
			<CardTitle className='text-base'>Newest members</CardTitle>
			<CardDescription>The latest people to join BeatBond</CardDescription>
		</CardHeader>
		<CardContent>
			{users.length === 0 ? (
				<p className='py-8 text-center text-sm text-muted-foreground'>No users yet.</p>
			) : (
				<ul className='grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2 lg:grid-cols-3'>
					{users.map((user) => (
						<li key={user._id} className='flex items-center gap-3'>
							<div className='relative'>
								<Avatar className='size-9'>
									<AvatarImage src={user.imageUrl} alt='' />
									<AvatarFallback>{user.fullName?.[0]?.toUpperCase() || "?"}</AvatarFallback>
								</Avatar>
								{user.isOnline && (
									<span className='absolute -bottom-0.5 -right-0.5 size-3 rounded-full border-2 border-card bg-emerald-500' aria-hidden />
								)}
							</div>
							<div className='min-w-0 flex-1'>
								<p className='truncate text-sm font-medium'>
									{user.fullName}
									{user.isOnline && <span className='sr-only'> (online)</span>}
								</p>
								<p className='truncate text-xs text-muted-foreground'>@{user.username}</p>
							</div>
							<p className='shrink-0 text-xs text-muted-foreground'>
								{formatDistanceToNow(new Date(user.createdAt), { addSuffix: true })}
							</p>
						</li>
					))}
				</ul>
			)}
		</CardContent>
	</Card>
);

export default RecentSignups;
