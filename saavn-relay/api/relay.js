// Forwards JioSaavn API calls from India. JioSaavn tailors search results to
// the caller's country, and outside India it hides many licensed originals, so
// the BeatBond backend (hosted abroad) sends its provider calls through here.
const UPSTREAM = "https://www.jiosaavn.com/api.php";

export async function GET(request) {
	const key = process.env.RELAY_KEY;
	// Without a shared secret this would be an open proxy, so refuse to run.
	if (!key || request.headers.get("x-relay-key") !== key) {
		return new Response("Forbidden", { status: 403 });
	}

	const upstream = new URL(UPSTREAM);
	upstream.search = new URL(request.url).search;
	if (!upstream.searchParams.get("__call")) {
		return new Response("Missing __call", { status: 400 });
	}

	try {
		const response = await fetch(upstream, {
			headers: {
				Accept: "application/json",
				"User-Agent": request.headers.get("user-agent") || "BeatBond/1.0",
			},
			signal: AbortSignal.timeout(10_000),
		});
		return new Response(await response.text(), {
			status: response.status,
			headers: { "Content-Type": response.headers.get("content-type") || "application/json" },
		});
	} catch {
		return new Response(JSON.stringify({ error: "JioSaavn did not respond" }), {
			status: 502,
			headers: { "Content-Type": "application/json" },
		});
	}
}
