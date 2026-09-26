import { distanceMeters, type LatLng } from "@/lib/geo";
import { displayName, personImage, type LiveLocation } from "./mapTypes";

const escapeHtml = (value = "") => value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character] || character);

const avatarHtml = (person: LiveLocation) => {
  const image = personImage(person);
  const initial = escapeHtml((displayName(person)[0] || "B").toUpperCase());
  // The fallback keeps the marker clean when an image host rejects a stale URL.
  return image
    ? `<img src="${escapeHtml(image)}" alt="" draggable="false" onerror="this.style.display='none';this.nextElementSibling.style.display='grid'" /><b class="map-avatar__fallback">${initial}</b>`
    : `<b class="map-avatar__initial">${initial}</b>`;
};

/** Everything that changes how a person's marker looks. */
export const personRenderKey = (person: LiveLocation, live: boolean, listening: boolean) =>
  [personImage(person), displayName(person), live, person.isFriend, listening].join("|");

export const renderPerson = (element: HTMLElement, person: LiveLocation, live: boolean, listening: boolean) => {
  const classes = ["map-person__body", live ? "is-live" : "is-stale", person.isFriend ? "is-friend" : ""].join(" ");
  const music = listening ? `<span class="map-person__music" aria-hidden="true"><i></i><i></i><i></i></span>` : "";
  const firstName = escapeHtml(displayName(person).split(/\s+/)[0]);
  element.setAttribute("aria-label", displayName(person));
  element.innerHTML = `<span class="${classes}"><span class="map-avatar">${avatarHtml(person)}</span>${music}<span class="map-person__name">${firstName}</span></span>`;
};

export const personElement = (person: LiveLocation, live: boolean, listening: boolean) => {
  const element = document.createElement("div");
  element.className = "map-person";
  element.setAttribute("role", "button");
  element.tabIndex = 0;
  renderPerson(element, person, live, listening);
  return element;
};

export const renderCluster = (element: HTMLElement, members: LiveLocation[], isLive: (person: LiveLocation) => boolean) => {
  const faces = members.slice(0, 3).map((person) => `<span class="map-avatar${person.isFriend ? " is-friend" : ""}">${avatarHtml(person)}</span>`).join("");
  const classes = ["map-cluster__body", members.some((person) => person.isFriend) ? "has-friend" : "", members.some(isLive) ? "has-live" : ""].join(" ");
  element.setAttribute("aria-label", `${members.length} people here`);
  element.innerHTML = `<span class="${classes}"><span class="map-cluster__faces">${faces}</span><b class="map-cluster__count">${members.length}</b></span>`;
};

export const clusterElement = (members: LiveLocation[], isLive: (person: LiveLocation) => boolean) => {
  const element = document.createElement("div");
  element.className = "map-cluster";
  element.setAttribute("role", "button");
  element.tabIndex = 0;
  renderCluster(element, members, isLive);
  return element;
};

/** You: your photo in a blue ring, pulsing, with a "You" tag so it stands out. */
export const renderSelf = (element: HTMLElement, imageUrl: string | undefined, name: string) => {
  const initial = escapeHtml((name.trim()[0] || "Y").toUpperCase());
  const face = imageUrl
    ? `<img src="${escapeHtml(imageUrl)}" alt="" draggable="false" onerror="this.style.display='none';this.nextElementSibling.style.display='grid'" /><b class="map-avatar__fallback">${initial}</b>`
    : `<b class="map-avatar__initial">${initial}</b>`;
  element.innerHTML = `<span class="map-self__pulse"></span><span class="map-self__avatar">${face}</span><span class="map-self__label">You</span>`;
};

export const selfElement = (imageUrl: string | undefined, name: string) => {
  const element = document.createElement("div");
  element.className = "map-self";
  element.setAttribute("aria-label", "Your location");
  renderSelf(element, imageUrl, name);
  return element;
};

export const placeElement = (name: string) => {
  const element = document.createElement("div");
  element.className = "map-place";
  element.innerHTML = `<span class="map-place__label">${escapeHtml(name)}</span><svg viewBox="0 0 24 32" aria-hidden="true"><path d="M12 0C5.4 0 0 5.3 0 11.9 0 20.8 12 32 12 32s12-11.2 12-20.1C24 5.3 18.6 0 12 0Z"/><circle cx="12" cy="12" r="4.5"/></svg>`;
  return element;
};

export type PolygonFeature = { type: "Feature"; properties: Record<string, never>; geometry: { type: "Polygon"; coordinates: number[][][] } };

/** A circle `meters` wide around `center`, drawn flat on the map. */
export const circlePolygon = (center: LatLng, meters: number, steps = 64): PolygonFeature => {
  const latRadius = meters / 111_320;
  const lngRadius = meters / (111_320 * Math.cos((center.lat * Math.PI) / 180));
  const ring = Array.from({ length: steps + 1 }, (_, index) => {
    const angle = (index / steps) * 2 * Math.PI;
    return [center.lng + lngRadius * Math.cos(angle), center.lat + latRadius * Math.sin(angle)];
  });
  return { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [ring] } };
};

const reducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
const glides = new WeakMap<object, number>();

/**
 * Moves something on the map smoothly from where it is now to `to`, instead
 * of jumping. Very long jumps, hidden pages and reduced-motion users snap.
 */
export const glide = (key: object, from: LatLng, to: LatLng, apply: (point: LatLng) => void, duration = 800) => {
  const running = glides.get(key);
  if (running) cancelAnimationFrame(running);
  const meters = distanceMeters(from, to);
  if (reducedMotion() || document.hidden || meters < 0.3 || meters > 50_000) {
    glides.delete(key);
    apply(to);
    return;
  }
  const start = performance.now();
  const step = (time: number) => {
    const t = Math.min(1, (time - start) / duration);
    const eased = 1 - (1 - t) ** 3;
    apply({ lat: from.lat + (to.lat - from.lat) * eased, lng: from.lng + (to.lng - from.lng) * eased });
    if (t < 1) glides.set(key, requestAnimationFrame(step));
    else glides.delete(key);
  };
  glides.set(key, requestAnimationFrame(step));
};
