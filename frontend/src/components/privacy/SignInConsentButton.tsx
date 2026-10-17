import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useSignIn } from "@clerk/clerk-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { LEGAL_CONSENT_SESSION_KEY, PRIVACY_VERSION, TERMS_VERSION, readLegalConsent } from "@/lib/legalConsent";

type Props = { label?: string; className?: string; children?: ReactNode };

const SignInConsentButton = ({ label = "Continue with Google", className, children }: Props) => {
  const { signIn, isLoaded } = useSignIn();
  const [open, setOpen] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [emailOptIn, setEmailOptIn] = useState(false);

  const startSignIn = async () => {
    if (!isLoaded) return;
    const current = readLegalConsent();
    if (!current) {
      setAccepted(false);
      setEmailOptIn(false);
      setOpen(true);
      return;
    }
    await signIn.authenticateWithRedirect({ strategy: "oauth_google", redirectUrl: "/sso-callback", redirectUrlComplete: "/auth-callback" });
  };

  const continueToGoogle = async () => {
    if (!accepted || !isLoaded) return;
    sessionStorage.setItem(LEGAL_CONSENT_SESSION_KEY, JSON.stringify({
      accepted: true,
      termsVersion: TERMS_VERSION,
      privacyVersion: PRIVACY_VERSION,
      emailMarketingOptIn: emailOptIn,
    }));
    await signIn.authenticateWithRedirect({ strategy: "oauth_google", redirectUrl: "/sso-callback", redirectUrlComplete: "/auth-callback" });
  };

  return <>
    <Button onClick={() => void startSignIn()} disabled={!isLoaded} variant="outline" className={className ?? "w-full bg-card hover:bg-secondary/80 text-foreground border-border h-11 transition-all duration-200 shadow-sm hover:shadow-md"}>
      {children ?? <><img src="/google.png" alt="" className="mr-2 size-5" />{label}</>}
    </Button>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Before you continue</DialogTitle>
          <DialogDescription>Review how BeatBond handles your data and the rules for using the service.</DialogDescription>
        </DialogHeader>
        <label className="flex items-start gap-3 text-sm leading-6">
          <input className="mt-1 size-4 accent-primary" type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} />
          <span>I agree to the <Link className="text-primary underline" to="/terms" target="_blank" rel="noreferrer">Terms of Service</Link> and acknowledge the <Link className="text-primary underline" to="/privacy" target="_blank" rel="noreferrer">Privacy Policy</Link>.</span>
        </label>
        <label className="flex items-start gap-3 text-sm leading-6 text-muted-foreground">
          <input className="mt-1 size-4 accent-primary" type="checkbox" checked={emailOptIn} onChange={(event) => setEmailOptIn(event.target.checked)} />
          <span>Send me optional product news and updates by email. This is optional and can be turned off in Settings. BeatBond currently sends no marketing emails.</span>
        </label>
        <DialogFooter>
          <Button onClick={() => void continueToGoogle()} disabled={!accepted || !isLoaded}>Continue with Google</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
};

export default SignInConsentButton;
