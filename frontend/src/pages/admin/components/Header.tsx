import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { cn } from "@/lib/utils";
import { UserButton, useUser } from "@clerk/clerk-react";
import { RefreshCw } from "lucide-react";
import { Link } from "react-router-dom";

type HeaderProps = {
	onRefresh: () => void;
	isRefreshing: boolean;
	updatedAt?: string;
};

const greeting = () => {
	const hour = new Date().getHours();
	if (hour < 12) return "Good morning";
	if (hour < 17) return "Good afternoon";
	return "Good evening";
};

const Header = ({ onRefresh, isRefreshing, updatedAt }: HeaderProps) => {
	const { user } = useUser();

	return (
		<header className='flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between'>
			<div className='flex items-center gap-3'>
				<Link to='/' className='shrink-0 rounded-lg' aria-label='Back to BeatBond'>
					<img src='/logo.png' alt='' className='size-10' />
				</Link>
				<div>
					<h1 className='text-2xl font-bold tracking-tight sm:text-3xl'>Admin dashboard</h1>
					<p className='text-sm text-muted-foreground'>
						{greeting()}
						{user?.firstName ? `, ${user.firstName}` : ""}. Here's how BeatBond is doing.
					</p>
				</div>
			</div>

			<div className='flex items-center gap-2'>
				{updatedAt && (
					<span className='mr-1 hidden text-xs text-muted-foreground md:inline'>
						Updated {new Date(updatedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
					</span>
				)}
				<Button variant='outline' size='sm' onClick={onRefresh} disabled={isRefreshing}>
					<RefreshCw className={cn("size-4", isRefreshing && "animate-spin")} />
					Refresh
				</Button>
				<ThemeToggle />
				<UserButton />
			</div>
		</header>
	);
};

export default Header;
