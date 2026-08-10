import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { recordRoute } from "@/lib/routeHistory";

/** Records only committed routes, keeping back behavior independent of redirects. */
const RouteHistoryTracker = () => {
  const location = useLocation();
  useEffect(() => {
    recordRoute(`${location.pathname}${location.search}${location.hash}`);
  }, [location.hash, location.pathname, location.search]);
  return null;
};

export default RouteHistoryTracker;
