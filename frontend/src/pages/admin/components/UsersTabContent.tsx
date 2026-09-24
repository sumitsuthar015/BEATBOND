import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useDebounce } from "@/hooks/useDebounce";
import { axiosInstance } from "@/lib/axios";
import { cn } from "@/lib/utils";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { format, formatDistanceToNow } from "date-fns";
import { ChevronLeft, ChevronRight, Search, Users2 } from "lucide-react";
import { useEffect, useState } from "react";
import { formatCount } from "../format";
import type { AdminUser, AdminUsersPage } from "../types";

const lastActive = (user: AdminUser) => {
	if (user.isOnline) return null;
	const seen = [user.lastSeen, user.lastPlayedAt]
		.filter(Boolean)
		.map((value) => new Date(value as string).getTime())
		.sort((a, b) => b - a)[0];
	return seen ? formatDistanceToNow(seen, { addSuffix: true }) : "Never";
};

const UsersTabContent = () => {
	const [search, setSearch] = useState("");
	const [page, setPage] = useState(1);
	const debouncedSearch = useDebounce(search.trim(), 350);

	useEffect(() => setPage(1), [debouncedSearch]);

	const { data, isLoading, isError, isFetching, refetch } = useQuery<AdminUsersPage>({
		queryKey: ["admin", "users", debouncedSearch, page],
		queryFn: async () =>
			(await axiosInstance.get("/admin/users", { params: { search: debouncedSearch, page, limit: 15 } })).data,
		placeholderData: keepPreviousData,
	});

	return (
		<Card>
			<CardHeader>
				<div className='flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between'>
					<div>
						<CardTitle className='flex items-center gap-2'>
							<Users2 className='size-5 text-emerald-600 dark:text-emerald-400' />
							Users
						</CardTitle>
						<CardDescription>
							{data ? `${formatCount(data.total)} ${data.total === 1 ? "member" : "members"}` : "Everyone on BeatBond"}
						</CardDescription>
					</div>
					<div className='relative w-full sm:w-72'>
						<Search className='absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground' />
						<Input
							value={search}
							onChange={(event) => setSearch(event.target.value)}
							placeholder='Search name, username or email'
							className='pl-9'
							aria-label='Search users'
						/>
					</div>
				</div>
			</CardHeader>
			<CardContent>
				{isLoading ? (
					<div className='space-y-2'>
						{Array.from({ length: 6 }, (_, i) => (
							<Skeleton key={i} className='h-12 w-full' />
						))}
					</div>
				) : isError ? (
					<div className='flex flex-col items-center gap-3 py-10 text-sm text-muted-foreground'>
						Couldn't load users.
						<Button variant='outline' size='sm' onClick={() => refetch()}>
							Try again
						</Button>
					</div>
				) : !data?.users.length ? (
					<p className='py-10 text-center text-sm text-muted-foreground'>
						{debouncedSearch ? `No users match "${debouncedSearch}".` : "No users yet."}
					</p>
				) : (
					<>
						<div className={cn("transition-opacity", isFetching && "opacity-60")}>
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead>User</TableHead>
										<TableHead className='hidden md:table-cell'>Email</TableHead>
										<TableHead className='hidden lg:table-cell'>Joined</TableHead>
										<TableHead>Last active</TableHead>
										<TableHead className='hidden sm:table-cell text-right'>Friends</TableHead>
										<TableHead className='text-right'>Plays</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{data.users.map((user) => (
										<TableRow key={user._id}>
											<TableCell>
												<div className='flex items-center gap-3'>
													<Avatar className='size-8'>
														<AvatarImage src={user.imageUrl} alt='' />
														<AvatarFallback>{user.fullName?.[0]?.toUpperCase() || "?"}</AvatarFallback>
													</Avatar>
													<div className='min-w-0'>
														<p className='truncate font-medium'>{user.fullName}</p>
														<p className='truncate text-xs text-muted-foreground'>@{user.username}</p>
													</div>
												</div>
											</TableCell>
											<TableCell className='hidden md:table-cell text-muted-foreground'>{user.email}</TableCell>
											<TableCell className='hidden lg:table-cell text-muted-foreground'>
												{format(new Date(user.createdAt), "d MMM yyyy")}
											</TableCell>
											<TableCell>
												{user.isOnline ? (
													<Badge className='gap-1.5 border-transparent bg-emerald-500/15 text-emerald-700 shadow-none hover:bg-emerald-500/15 dark:text-emerald-400'>
														<span className='size-1.5 rounded-full bg-emerald-500' aria-hidden />
														Online
													</Badge>
												) : (
													<span className='text-muted-foreground'>{lastActive(user)}</span>
												)}
											</TableCell>
											<TableCell className='hidden sm:table-cell text-right tabular-nums'>{formatCount(user.friendsCount)}</TableCell>
											<TableCell className='text-right tabular-nums'>{formatCount(user.plays)}</TableCell>
										</TableRow>
									))}
								</TableBody>
							</Table>
						</div>
						{data.pages > 1 && (
							<div className='mt-4 flex items-center justify-between text-sm text-muted-foreground'>
								<span>
									Page {data.page} of {data.pages}
								</span>
								<div className='flex gap-2'>
									<Button variant='outline' size='sm' onClick={() => setPage((p) => p - 1)} disabled={page <= 1 || isFetching}>
										<ChevronLeft className='size-4' />
										Previous
									</Button>
									<Button
										variant='outline'
										size='sm'
										onClick={() => setPage((p) => p + 1)}
										disabled={page >= data.pages || isFetching}
									>
										Next
										<ChevronRight className='size-4' />
									</Button>
								</div>
							</div>
						)}
					</>
				)}
			</CardContent>
		</Card>
	);
};

export default UsersTabContent;
