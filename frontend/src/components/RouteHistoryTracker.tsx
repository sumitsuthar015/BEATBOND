import { useEffect } from "react";
import { useLocation, useNavigationType } from "react-router-dom";
import { recordRoute } from "@/lib/routeHistory";

/** Records only committed routes, keeping back behavior independent of redirects. */
const RouteHistoryTracker = () => {
  const location = useLocation();
  const action = useNavigationType();
  useEffect(() => {
    recordRoute(`${location.pathname}${location.search}${location.hash}`, action);
  }, [action, location.hash, location.pathname, location.search]);
  return null;
};

export default RouteHistoryTracker;
