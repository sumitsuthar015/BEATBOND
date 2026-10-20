import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { beginBackNavigation } from "@/lib/routeHistory";
import { cn } from "@/lib/utils";

/** A normal-flow back control for pages that need their own navigation. */
export const PageBackButton = ({ className }: { className?: string }) => {
	const navigate = useNavigate();
	return (
		<Button
			type="button"
			variant="ghost"
			size="icon"
			className={cn("-ml-2 mb-3 size-10 text-muted-foreground hover:text-foreground", className)}
			onClick={() => navigate(beginBackNavigation(), { replace: true })}
			aria-label="Go back"
			title="Go back"
		>
			<ArrowLeft className="size-4" />
		</Button>
	);
};
