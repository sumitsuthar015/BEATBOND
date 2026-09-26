import { FormEvent, KeyboardEvent, useEffect, useMemo, useState } from "react";
import { Loader2, MapPin, Search, X } from "lucide-react";
import { isCancel } from "axios";
import { toast } from "react-hot-toast";
import { axiosInstance } from "@/lib/axios";
import type { LatLng } from "@/lib/geo";
import { displayName, personImage, type LiveLocation, type PlaceResult } from "../mapTypes";

type Option = { type: "person"; person: LiveLocation } | { type: "place"; place: PlaceResult };

type PlaceSearchProps = {
  people: LiveLocation[];
  /** Where the map is looking, so nearby places rank first. */
  getBias: () => LatLng | null;
  onPickPlace: (place: PlaceResult) => void;
  onPickPerson: (person: LiveLocation) => void;
  onClear: () => void;
};

const fetchPlaces = async (term: string, bias: LatLng | null, signal?: AbortSignal) => {
  const { data } = await axiosInstance.get<{ results?: PlaceResult[] }>("/locations/search", {
    params: { q: term, ...(bias && { lat: bias.lat, lng: bias.lng }) },
    signal,
  });
  return data.results ?? [];
};

const PlaceSearch = ({ people, getBias, onPickPlace, onPickPerson, onClear }: PlaceSearchProps) => {
  const [query, setQuery] = useState("");
  const [places, setPlaces] = useState<PlaceResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [active, setActive] = useState(0);
  const term = query.trim();

  const matchingPeople = useMemo(() => {
    const needle = term.toLowerCase();
    if (!needle) return [];
    return people.filter((person) => `${person.user?.fullName ?? ""} ${person.user?.username ?? ""}`.toLowerCase().includes(needle)).slice(0, 3);
  }, [people, term]);

  // Suggestions follow typing, but wait for a pause so each keystroke doesn't
  // become a request (the free geocoder asks for fair use).
  useEffect(() => {
    if (term.length < 3) {
      setPlaces([]);
      setIsLoading(false);
      return;
    }
    const controller = new AbortController();
    setIsLoading(true);
    const timer = window.setTimeout(() => {
      fetchPlaces(term, getBias(), controller.signal)
        .then((results) => {
          setPlaces(results);
          setActive(0);
        })
        .catch((error) => { if (!isCancel(error)) setPlaces([]); })
        .finally(() => { if (!controller.signal.aborted) setIsLoading(false); });
    }, 350);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [term, getBias]);

  const options: Option[] = [
    ...matchingPeople.map((person) => ({ type: "person" as const, person })),
    ...places.map((place) => ({ type: "place" as const, place })),
  ];

  const pick = (option: Option) => {
    setIsOpen(false);
    if (option.type === "person") {
      setQuery("");
      onPickPerson(option.person);
    } else {
      setQuery(option.place.name);
      onPickPlace(option.place);
    }
    (document.activeElement as HTMLElement | null)?.blur();
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (options.length) return pick(options[Math.min(active, options.length - 1)]);
    if (term.length < 2) return;
    // Enter pressed before suggestions arrived: search right away.
    setIsLoading(true);
    try {
      const [first] = await fetchPlaces(term, getBias());
      if (first) pick({ type: "place", place: first });
      else toast.error("No matching place found.");
    } catch {
      toast.error("Search isn't available right now.");
    } finally {
      setIsLoading(false);
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") return setIsOpen(false);
    if (!options.length) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setIsOpen(true);
      setActive((index) => (index + 1) % options.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((index) => (index - 1 + options.length) % options.length);
    }
  };

  const clear = () => {
    setQuery("");
    setPlaces([]);
    onClear();
  };

  const showList = isOpen && term.length > 0 && (options.length > 0 || (!isLoading && term.length >= 3));

  return (
    <form onSubmit={submit} role="search" className="relative min-w-0 flex-1">
      <Search className="pointer-events-none absolute left-4 top-1/2 z-10 size-5 -translate-y-1/2 text-zinc-500" aria-hidden />
      <input
        value={query}
        onChange={(event) => { setQuery(event.target.value); setIsOpen(true); }}
        onFocus={() => setIsOpen(true)}
        onBlur={() => setIsOpen(false)}
        onKeyDown={onKeyDown}
        placeholder="Search places or people…"
        aria-label="Search places or people on the map"
        aria-expanded={showList}
        aria-autocomplete="list"
        role="combobox"
        aria-controls="map-search-results"
        enterKeyHint="search"
        className="h-12 w-full rounded-2xl border border-white/10 bg-zinc-950/90 pl-12 pr-12 text-[15px] text-white shadow-xl outline-none backdrop-blur-xl placeholder:text-zinc-500 focus:border-violet-400/60"
      />
      <span className="absolute right-3 top-1/2 z-10 -translate-y-1/2">
        {isLoading ? (
          <Loader2 className="size-5 animate-spin text-zinc-400" aria-label="Searching" />
        ) : query ? (
          <button type="button" onClick={clear} aria-label="Clear search" className="grid size-7 place-items-center rounded-full text-zinc-400 hover:bg-white/10 hover:text-white">
            <X className="size-4" />
          </button>
        ) : null}
      </span>

      {showList && (
        <ul
          id="map-search-results"
          role="listbox"
          // Keep focus in the input so a tap on a result isn't lost to blur.
          onMouseDown={(event) => event.preventDefault()}
          className="absolute inset-x-0 top-[calc(100%+0.5rem)] max-h-[min(60vh,420px)] overflow-y-auto rounded-2xl border border-white/10 bg-zinc-950/95 p-1.5 text-white shadow-2xl backdrop-blur-xl"
        >
          {options.length === 0 && <li className="px-3 py-3 text-sm text-zinc-400">No places found for “{term}”.</li>}
          {options.map((option, index) => {
            const selected = index === active;
            const base = `flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left ${selected ? "bg-white/10" : "hover:bg-white/5"}`;
            if (option.type === "person") {
              const image = personImage(option.person);
              return (
                <li key={`p-${option.person.userId}`} role="option" aria-selected={selected}>
                  <button type="button" className={base} onClick={() => pick(option)} onMouseEnter={() => setActive(index)}>
                    <span className="grid size-8 shrink-0 place-items-center overflow-hidden rounded-full bg-violet-500/20 text-sm font-bold text-violet-200">
                      {image ? <img src={image} alt="" className="size-full object-cover" /> : displayName(option.person)[0]}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold">{displayName(option.person)}</span>
                      <span className="block truncate text-xs text-zinc-400">On the map{option.person.isFriend ? " · Friend" : ""}</span>
                    </span>
                  </button>
                </li>
              );
            }
            return (
              <li key={option.place.id} role="option" aria-selected={selected}>
                <button type="button" className={base} onClick={() => pick(option)} onMouseEnter={() => setActive(index)}>
                  <span className="grid size-8 shrink-0 place-items-center rounded-full bg-white/10 text-zinc-300">
                    <MapPin className="size-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">{option.place.name}</span>
                    {option.place.detail && <span className="block truncate text-xs text-zinc-400">{option.place.detail}</span>}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </form>
  );
};

export default PlaceSearch;
