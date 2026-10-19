/**
 * Small in-app history stack for explicit Back controls. Browser history can
 * retain forward entries after a user changes direction; this stack keeps the
 * app's Back button anchored to the immediately preceding app screen.
 */
let routes: string[] = [];
let currentIndex = -1;
let pendingBackTarget: string | null = null;

export const recordRoute = (route: string, action: "POP" | "PUSH" | "REPLACE" = "PUSH") => {
  if (!route) return;
  if (routes[currentIndex] === route) {
    if (pendingBackTarget === route) pendingBackTarget = null;
    return;
  }

  if (pendingBackTarget === route) {
    currentIndex = routes.lastIndexOf(route, currentIndex - 1);
    pendingBackTarget = null;
    return;
  }

  // Browser and Android hardware Back use POP. Move the app stack cursor back
  // instead of recording the destination as a new forward route.
  if (action === "POP") {
    const previousIndex = routes.lastIndexOf(route, currentIndex - 1);
    if (previousIndex >= 0) currentIndex = previousIndex;
    else {
      routes = routes.slice(0, currentIndex + 1);
      routes.push(route);
      currentIndex = routes.length - 1;
    }
    pendingBackTarget = null;
    return;
  }

  if (action === "REPLACE") {
    if (currentIndex < 0) {
      routes = [route];
      currentIndex = 0;
    } else {
      routes[currentIndex] = route;
    }
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
