import { Card, CardContent } from "@/components/ui/card";
import { axiosInstance } from "@/lib/axios";
import { useAuth, useUser } from "@clerk/clerk-react";
import { Loader } from "lucide-react";
import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "react-hot-toast";

const AuthCallbackPage = () => {
	const { isLoaded, user } = useUser();
	const { getToken } = useAuth();
	const navigate = useNavigate();
	const syncAttempted = useRef(false);

	useEffect(() => {
		const syncUser = async () => {
			if (!isLoaded || !user || syncAttempted.current) return;

			try {
				syncAttempted.current = true;
				const token = await getToken();
				const response = await axiosInstance.post("/auth/callback", {
					email_addresses: user.primaryEmailAddress?.emailAddress,
					username: user.username,
					first_name: user.firstName,
					last_name: user.lastName,
					image_url: user.imageUrl,
				}, { headers: { Authorization: `Bearer ${token}` } });

				if (response.data.success) {
					toast.success("Successfully signed in!");
				} else {
					toast.error("Something went wrong during sign in");
				}
			} catch (error) {
			console.error("Error in auth callback:", error);
				toast.error("Failed to complete sign in");
			} finally {
				navigate("/");
			}
		};

		syncUser();
	}, [isLoaded, user, getToken, navigate]);

	return (
		<div className="h-screen w-full bg-background flex items-center justify-center">
			<Card className="w-[90%] max-w-md">
				<CardContent className="flex flex-col items-center gap-4 pt-6">
					<Loader className="size-6 text-primary animate-spin" />
					<h3 className="text-foreground text-xl font-bold">Logging you in</h3>
					<p className="text-muted-foreground text-sm">Please wait while we set up your account...</p>
				</CardContent>
			</Card>
		</div>
	);
};

export default AuthCallbackPage;
