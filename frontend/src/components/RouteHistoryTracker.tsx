import { useEffect, useLayoutEffect, useRef } from "react";
import { useLocation, useNavigationType } from "react-router-dom";
import { recordRoute } from "@/lib/routeHistory";

const SCROLL_STORAGE_KEY = "beatbond:route-scroll-positions";
type ScrollPositions = Record<string, number>;
const pendingScrollRestorations = new Set<string>();

const routeKeyFor = (pathname: string, search: string, hash: string) => `${pathname}${search}${hash}`;

const getPageScrollRoot = (): HTMLElement | null => {
  const scope = document.getElementById("main-content") || document.body;
  const candidates = scope.querySelectorAll<HTMLElement>(
    "[data-radix-scroll-area-viewport], main, [class*='overflow-y-auto'], [class*='overflow-auto']",
  );
  const scrollRoots = Array.from(candidates)
    .filter((element) => {
      const overflowY = window.getComputedStyle(element).overflowY;
      return (overflowY === "auto" || overflowY === "scroll") && element.clientHeight > 0;
    })
    .sort((left, right) => right.clientHeight - left.clientHeight);
  for (const element of scrollRoots) {
    const overflowY = window.getComputedStyle(element).overflowY;
    if (overflowY === "auto" || overflowY === "scroll") return element;
  }
  return null;
};

const readScrollPositions = (): ScrollPositions => {
  try {
    return JSON.parse(sessionStorage.getItem(SCROLL_STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
};

const writeScrollPosition = (routeKey: string, scrollTop: number) => {
  try {
    const positions = readScrollPositions();
    positions[routeKey] = scrollTop;
    sessionStorage.setItem(SCROLL_STORAGE_KEY, JSON.stringify(positions));
  } catch {
    // Scroll restoration remains best-effort when browser storage is disabled.
  }
};

/** Records only committed routes, keeping back behavior independent of redirects. */
const RouteHistoryTracker = () => {
  const location = useLocation();
  const action = useNavigationType();
  const routeKey = routeKeyFor(location.pathname, location.search, location.hash);
  const currentRouteKey = useRef(routeKey);
  currentRouteKey.current = routeKey;

  useEffect(() => {
    recordRoute(`${location.pathname}${location.search}${location.hash}`, action);
  }, [action, location.hash, location.pathname, location.search]);

  useEffect(() => {
    let pendingCapture: { routeKey: string; scrollTop: number } | null = null;
    let saveTimer: number | null = null;
    const persistPending = () => {
      if (saveTimer !== null) window.clearTimeout(saveTimer);
      saveTimer = null;
      if (!pendingCapture) return;
      writeScrollPosition(pendingCapture.routeKey, pendingCapture.scrollTop);
      pendingCapture = null;
    };
    const capture = (event: Event) => {
      const activeRouteKey = currentRouteKey.current;
      if (pendingScrollRestorations.has(activeRouteKey)) return;
      const scrollRoot = getPageScrollRoot();
      if (!scrollRoot) return;
      pendingCapture = { routeKey: activeRouteKey, scrollTop: scrollRoot.scrollTop };
      // Avoid synchronous sessionStorage writes at the scroll event rate.
      if (event.type === "click") persistPending();
      else if (saveTimer === null) saveTimer = window.setTimeout(persistPending, 120);
    };

    // Scroll does not bubble, so capture it at document level to remember the
    // active page's own scroller (Home and Library do not scroll the window).
    document.addEventListener("scroll", capture, true);
    // Save once more before links/buttons trigger route navigation. This also
    // covers browsers that coalesce the final touch scroll event on mobile.
    document.addEventListener("click", capture, true);
    return () => {
      persistPending();
      document.removeEventListener("scroll", capture, true);
      document.removeEventListener("click", capture, true);
    };
  }, [routeKey]);

  useLayoutEffect(() => {
    const savedTop = readScrollPositions()[routeKey];
    if (typeof savedTop !== "number" || savedTop <= 0) return;
    pendingScrollRestorations.add(routeKey);

    const restore = () => {
      const scrollRoot = getPageScrollRoot();
      if (!scrollRoot) return false;
      scrollRoot.scrollTop = savedTop;
      const restored = scrollRoot.scrollTop >= savedTop - 1;
      if (restored) pendingScrollRestorations.delete(routeKey);
      return restored;
    };

    // Apply a cached position before the browser paints the remounted page so
    // Back never visibly flashes the user at the top first.
    if (restore()) return;

    // Lazy routes and their API data can arrive after this effect. Retry while
    // the page mounts so a short initial content height cannot clamp the saved
    // position back to the top.
    let attempts = 0;
    const timer = window.setInterval(() => {
      const scrollRoot = getPageScrollRoot();
      attempts += 1;
      if (scrollRoot) {
        scrollRoot.scrollTop = savedTop;
        if (scrollRoot.scrollTop >= savedTop - 1) {
          pendingScrollRestorations.delete(routeKey);
          window.clearInterval(timer);
          return;
        }
      }
      if (attempts >= 80) {
        pendingScrollRestorations.delete(routeKey);
        window.clearInterval(timer);
      }
    }, 50);

    return () => {
      window.clearInterval(timer);
      pendingScrollRestorations.delete(routeKey);
    };
  }, [routeKey]);

  return null;
};

export default RouteHistoryTracker;
