// Human-friendly formatting for scheduled-meeting times. Pure functions — every
// "now" is injectable so the bucketing is deterministic and unit-testable.

const MS_PER_DAY = 86_400_000;

type DateInput = string | number | Date;

const startOfDay = (d: Date): number =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

// "Today" / "Tomorrow" / "Yesterday", else "Mon, Jun 2" (year added if it differs).
export function dayLabel(date: DateInput, now = new Date()): string {
  const d = new Date(date);
  const diffDays = Math.round((startOfDay(d) - startOfDay(now)) / MS_PER_DAY);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  if (diffDays === -1) return 'Yesterday';
  const sameYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
}

// "3:00 PM" in the viewer's locale.
export function timeLabel(date: DateInput): string {
  return new Date(date).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
}

// "Today, 3:00 PM" / "Mon, Jun 2, 9:00 AM".
export function formatMeetingTime(date: DateInput, now = new Date()): string {
  return `${dayLabel(date, now)}, ${timeLabel(date)}`;
}

// Relative hint: "in 20 min" / "in 2 hours" / "3 days ago" / "Starting now".
export function relativeTime(date: DateInput, now = new Date()): string {
  const ms = new Date(date).getTime() - now.getTime();
  const abs = Math.abs(ms);
  if (abs < 60_000) return 'Starting now';
  const mins = Math.round(abs / 60_000);
  const hrs = Math.round(abs / 3_600_000);
  const days = Math.round(abs / MS_PER_DAY);
  let phrase;
  if (mins < 60) phrase = `${mins} min`;
  else if (hrs < 24) phrase = `${hrs} hour${hrs === 1 ? '' : 's'}`;
  else phrase = `${days} day${days === 1 ? '' : 's'}`;
  return ms >= 0 ? `in ${phrase}` : `${phrase} ago`;
}

// Value for a native <input type="datetime-local">, which wants local wall-clock
// time as "YYYY-MM-DDTHH:mm" (no timezone, no seconds).
export function toDatetimeLocalValue(date: DateInput): string {
  const d = new Date(date);
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}`
  );
}
