import { Home, Music2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

export default function NotFoundPage() {
	const navigate = useNavigate();

	return (
		<div className="h-full min-h-[60vh] flex items-center justify-center p-4">
			<div className="text-center space-y-8 max-w-md">
				<div className="flex justify-center">
					<div className="rounded-full bg-primary/10 p-6">
						<Music2 className="h-16 w-16 text-primary" />
					</div>
				</div>

				<div className="space-y-3">
					<h1 className="text-6xl font-bold text-foreground">404</h1>
					<h2 className="text-xl font-semibold text-foreground">Page not found</h2>
					<p className="text-muted-foreground">
						This page doesn't exist or may have been moved. Head back to keep listening.
					</p>
				</div>

				<div className="flex flex-col sm:flex-row gap-3 justify-center">
					<Button onClick={() => navigate("/")} className="w-full sm:w-auto">
						<Home className="mr-2 h-4 w-4" />
						Back to Home
					</Button>
				</div>
			</div>
		</div>
	);
}
