import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { Outlet, useLocation } from "react-router-dom";
import LeftSidebar from "./components/LeftSidebar";
import { FriendsActivity } from "./components/FriendsActivity";
import { PlaybackControls } from "./components/PlaybackControls";
import { useEffect, useState } from "react";
import { AnimatedBackground } from "@/components/ui/animated-background";
import MobileNav from "./components/MobileNav";
import { LyricsPanel } from "./components/LyricsPanel";
import OfflineBanner from "@/components/OfflineBanner";

const MainLayout = () => {
  const location = useLocation();
  const [isMobile, setIsMobile] = useState(false);
  const [isFloating, setIsFloating] = useState(false);
  const isChatPage = location.pathname === "/chat";
  const isMapPage = location.pathname === "/map";

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };

    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // Chat and the map are immersive mobile screens. Keep them outside the
  // regular shell so the player and bottom navigation never reduce or cover
  // their viewport.
  if ((isChatPage || isMapPage) && isMobile) {
    return (
      <div className="relative h-dvh min-h-0 overflow-hidden bg-background">
        <AnimatedBackground />
        <div className="relative z-10 h-full min-h-0">
          <Outlet />
        </div>
      </div>
    );
  }

  return (
    // Reserve space for the fixed player (and the mobile mini-player + nav)
    // so no page, lyrics card, or friends panel can render underneath it.
    <div className={`flex h-dvh min-h-0 flex-col ${isChatPage ? "pb-16 md:pb-0" : "pb-24 md:pb-[88px]"}`}>
      <AnimatedBackground />
      <OfflineBanner />
      <ResizablePanelGroup
        direction="horizontal"
        className="z-10 flex min-h-0 flex-1 gap-2 p-2"
      >
        {!isMobile && (
          <>
            <ResizablePanel defaultSize={20} minSize={10} maxSize={30}>
              <div className="h-full">
                <LeftSidebar />
              </div>
            </ResizablePanel>
            <ResizableHandle className="w-2 bg-white/10 rounded-full transition-colors hover:bg-white/20" />
          </>
        )}

        {/* Main content */}
        <ResizablePanel defaultSize={isMobile ? 100 : 60} minSize={isMobile ? 100 : undefined}>
          <div className="h-full">
            <Outlet />
          </div>
        </ResizablePanel>

        {!isMobile && !isFloating && (
          <>
            <ResizableHandle className="w-2 bg-white/10 rounded-full transition-colors hover:bg-white/20" />
            <ResizablePanel
              defaultSize={20}
              minSize={0}
              maxSize={25}
              collapsedSize={0}
              className="transition-all duration-300 ease-in-out"
            >
              <div className="flex h-full min-h-0 flex-col gap-2">
                {/* Keep friend activity at the top while reserving most space for lyrics. */}
                <div className="min-h-0 flex-1">
                  <FriendsActivity onToggleFloat={() => setIsFloating(true)} />
                </div>
                <LyricsPanel className="h-[36%] shrink-0" />
              </div>
            </ResizablePanel>
          </>
        )}
      </ResizablePanelGroup>

      {/* Floating Friends Panel */}
      {!isMobile && isFloating && (
        <div className="fixed bottom-[104px] right-4 z-50 w-80 rounded-lg border border-border bg-card shadow-xl">
          <FriendsActivity isFloating onToggleFloat={() => setIsFloating(false)} />
        </div>
      )}

      {!isChatPage && <PlaybackControls />}
      <MobileNav />
    </div>
  );
};

export default MainLayout;
