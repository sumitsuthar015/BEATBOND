const compact = new Intl.NumberFormat("en-IN", { notation: "compact", maximumFractionDigits: 1 });
const whole = new Intl.NumberFormat("en-IN");

/** 1,284 stays exact; bigger numbers compact to 12.9K / 4.2M. */
export const formatCount = (value: number) => (Math.abs(value) < 10_000 ? whole.format(value) : compact.format(value));

/** Seconds -> "3:07" (or "1:02:45" past an hour). */
export const formatDuration = (totalSeconds: number) => {
	const seconds = Math.max(0, Math.round(totalSeconds || 0));
	const h = Math.floor(seconds / 3600);
	const m = Math.floor((seconds % 3600) / 60);
	const s = String(seconds % 60).padStart(2, "0");
	return h ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
};

/** "2026-09-24" -> "24 Sep", read as a calendar day rather than a UTC instant. */
export const formatDayLabel = (isoDay: string) => {
	const [year, month, day] = isoDay.split("-").map(Number);
	return new Date(year, month - 1, day).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
};

export type Trend = { direction: "up" | "down" | "flat"; text: string };

/** Week-over-week change, e.g. "+12% vs last week". */
export const weekOverWeek = (current: number, previous: number): Trend => {
	if (current === previous) return { direction: "flat", text: "Same as last week" };
	if (previous === 0) return { direction: "up", text: `+${formatCount(current)} vs last week` };
	const change = Math.round(((current - previous) / previous) * 100);
	if (change === 0) return { direction: "flat", text: "Same as last week" };
	return { direction: change > 0 ? "up" : "down", text: `${change > 0 ? "+" : ""}${change}% vs last week` };
};
