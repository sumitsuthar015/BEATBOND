import { useSignIn } from "@clerk/clerk-react";
import { Button } from "./ui/button";

const SignInOAuthButtons = () => {
  const { signIn, isLoaded } = useSignIn();

  if (!isLoaded) {
    return null;
  }

  const signInWithGoogle = () => {
    signIn.authenticateWithRedirect({
      strategy: "oauth_google",
      redirectUrl: "/sso-callback",
      redirectUrlComplete: "/auth-callback",
    });
  };

  return (
    <Button
      onClick={signInWithGoogle}
      variant={"outline"}
      className="w-full bg-card hover:bg-secondary/80 text-foreground border-border h-11
						transition-all duration-200 shadow-sm hover:shadow-md"
    >
      <img src="/google.png" alt="Google" className="size-5 mr-2" />
      Continue with Google
    </Button>
  );
};
export default SignInOAuthButtons;
