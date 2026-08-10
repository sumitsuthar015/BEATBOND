import { ArrowLeft } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { beginBackNavigation } from "@/lib/routeHistory";

/** A single, predictable escape route for every non-home screen. */
const PageBackButton = () => {
  const location = useLocation();
  const navigate = useNavigate();

  // Chat owns its complete fullscreen header, including the back action.
  if (location.pathname === "/" || location.pathname === "/chat") return null;

  const goBack = () => {
    navigate(beginBackNavigation(), { replace: true });
  };

  return (
    <Button
      type="button"
      variant="secondary"
      size="icon"
      onClick={goBack}
      className={`fixed left-3 z-[1000] size-10 rounded-full border border-border/70 bg-background/90 shadow-lg backdrop-blur hover:bg-secondary md:left-5 ${location.pathname === "/map" ? "top-[4rem] md:top-16" : "top-[max(0.75rem,env(safe-area-inset-top))] md:top-5"}`}
      aria-label="Go back"
      title="Go back"
    >
      <ArrowLeft className="size-5" />
    </Button>
  );
};

export default PageBackButton;
