import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { axiosInstance } from "@/lib/axios";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { MessageCircle, ShieldCheck } from "lucide-react";
import toast from "react-hot-toast";
import ConfirmDeleteButton from "./ConfirmDeleteButton";
import type { ContentAuthor, ModerationFeed } from "../types";

const MODERATION_KEY = ["admin", "moderation"];

const AuthorLine = ({ author, createdAt }: { author: ContentAuthor; createdAt: string }) => (
	<div className='flex items-center gap-2'>
		<Avatar className='size-7'>
			<AvatarImage src={author.imageUrl} alt='' />
			<AvatarFallback className='text-xs'>{author.fullName?.[0]?.toUpperCase() || "?"}</AvatarFallback>
		</Avatar>
		<p className='min-w-0 truncate text-sm'>
			<span className='font-medium'>{author.fullName}</span>
			{author.username && <span className='text-muted-foreground'> @{author.username}</span>}
		</p>
		<span className='shrink-0 text-xs text-muted-foreground'>
			· {formatDistanceToNow(new Date(createdAt), { addSuffix: true })}
		</span>
	</div>
);

const ModerationTabContent = () => {
	const queryClient = useQueryClient();
	const { data, isLoading, isError, refetch } = useQuery<ModerationFeed>({
		queryKey: MODERATION_KEY,
		queryFn: async () => (await axiosInstance.get("/admin/moderation")).data,
	});

	const removeComment = async (id: string) => {
		try {
			await axiosInstance.delete(`/admin/comments/${id}`);
			queryClient.setQueryData<ModerationFeed>(MODERATION_KEY, (feed) =>
				feed ? { comments: feed.comments.filter((comment) => comment._id !== id) } : feed
			);
			queryClient.invalidateQueries({ queryKey: ["admin", "overview"] });
			toast.success("Comment removed");
		} catch (error: any) {
			toast.error(error.response?.data?.message || "Couldn't remove the comment. Please try again.");
			throw error;
		}
	};

	if (isLoading) return <Skeleton className='h-[420px] rounded-xl' />;

	if (isError || !data) {
		return (
			<Card className='flex flex-col items-center gap-3 py-12 text-sm text-muted-foreground'>
				Couldn't load song comments.
				<Button variant='outline' size='sm' onClick={() => refetch()}>
					Try again
				</Button>
			</Card>
		);
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle className='flex items-center gap-2 text-base'>
					<MessageCircle className='size-4 text-emerald-600 dark:text-emerald-400' />
					Recent song comments
				</CardTitle>
				<CardDescription>Remove spam or abusive comments</CardDescription>
			</CardHeader>
			<CardContent>
				{data.comments.length === 0 ? (
					<div className='flex flex-col items-center gap-2 py-10 text-center text-sm text-muted-foreground'>
						<ShieldCheck className='size-6' />
						No comments yet.
					</div>
				) : (
					<ul className='divide-y'>
						{data.comments.map((comment) => (
							<li key={comment._id} className='flex gap-3 py-3 first:pt-0 last:pb-0'>
								<div className='min-w-0 flex-1 space-y-2'>
									<AuthorLine author={comment.author} createdAt={comment.createdAt} />
									<p className='break-words text-sm'>{comment.content}</p>
									<div className='flex items-center gap-2 text-xs text-muted-foreground'>
										<img
											src={comment.songImageUrl || "/default-image.png"}
											alt=''
											className='size-5 rounded object-cover'
											loading='lazy'
										/>
										<span className='truncate'>
											on {comment.songTitle} · {comment.songArtist}
										</span>
									</div>
								</div>
								<ConfirmDeleteButton
									label={`Remove comment by ${comment.author.fullName}`}
									title='Remove this comment?'
									description={`The comment by ${comment.author.fullName} on "${comment.songTitle}" will be deleted for everyone. This can't be undone.`}
									confirmText='Remove comment'
									onConfirm={() => removeComment(comment._id)}
								/>
							</li>
						))}
					</ul>
				)}
			</CardContent>
		</Card>
	);
};

export default ModerationTabContent;
