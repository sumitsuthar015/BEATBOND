/**
 * Small in-app history stack for explicit Back controls. Browser history can
 * retain forward entries after a user changes direction; this stack keeps the
 * app's Back button anchored to the immediately preceding app screen.
 */
let routes: string[] = [];
let currentIndex = -1;
let pendingBackTarget: string | null = null;

export const recordRoute = (route: string) => {
  if (!route || routes[currentIndex] === route) return;

  if (pendingBackTarget === route) {
    currentIndex = routes.lastIndexOf(route, currentIndex - 1);
    pendingBackTarget = null;
    return;
  }

  routes = routes.slice(0, currentIndex + 1);
  routes.push(route);
  currentIndex = routes.length - 1;
};

export const previousRoute = () => routes[currentIndex - 1] || "/";

export const beginBackNavigation = () => {
  const target = previousRoute();
  pendingBackTarget = target;
  return target;
};
