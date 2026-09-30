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

// Relative hint: "in 20 min" / "in 1 hour" / "3 days ago" / "Starting now".
// Hours and days are whole units already elapsed or remaining, so 90 minutes
// reads "in 1 hour" (not "in 2 hours") and a meeting that already started is
// never described as "Starting now".
export function relativeTime(date: DateInput, now = new Date()): string {
  const target = new Date(date).getTime();
  if (Number.isNaN(target)) return '';
  const ms = target - now.getTime();
  const abs = Math.abs(ms);
  const ahead = ms >= 0;
  const wrap = (phrase: string) => (ahead ? `in ${phrase}` : `${phrase} ago`);

  if (abs < 60_000) return ahead ? 'Starting now' : 'Just started';

  if (abs < 3_600_000) {
    const minutes = Math.max(1, Math.round(abs / 60_000));
    if (minutes < 60) return wrap(`${minutes} min`);
    return wrap('1 hour');
  }

  if (abs < MS_PER_DAY) {
    const hours = Math.floor(abs / 3_600_000);
    return wrap(`${hours} hour${hours === 1 ? '' : 's'}`);
  }

  const days = Math.floor(abs / MS_PER_DAY);
  return wrap(`${days} day${days === 1 ? '' : 's'}`);
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
