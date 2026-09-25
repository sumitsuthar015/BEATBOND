import { ArrowLeft } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { beginBackNavigation } from "@/lib/routeHistory";

/**
 * The sidebar (desktop) and bottom navigation (phones) are the way around the
 * app, so pages don't get a floating back button. The one exception is the
 * map on phones: it opens fullscreen without the bottom navigation, so this
 * button is the only way out of it.
 */
const PageBackButton = () => {
  const location = useLocation();
  const navigate = useNavigate();

  if (location.pathname !== "/map") return null;

  return (
    <Button
      type="button"
      variant="secondary"
      size="icon"
      onClick={() => navigate(beginBackNavigation(), { replace: true })}
      className="fixed left-3 top-[4rem] z-[1000] size-10 rounded-full border border-border/70 bg-background/90 shadow-lg backdrop-blur hover:bg-secondary md:hidden"
      aria-label="Go back"
      title="Go back"
    >
      <ArrowLeft className="size-5" />
    </Button>
  );
};

export default PageBackButton;
