// Helpers for sharing a scheduled meeting: the join link, a one-click
// "Add to Google Calendar" URL, and a copy-pasteable invite blurb.
// All pure — `origin` is injectable so they're unit-testable off the DOM.

// The lobby URL someone clicks to join (lands on RoomGuard → LobbyPage).
export function buildJoinUrl(roomId, origin = window.location.origin) {
  return `${origin}/lobby/${encodeURIComponent(roomId)}`;
}

// Google Calendar's TEMPLATE links want UTC stamps as YYYYMMDDTHHMMSSZ.
function toGCalStamp(date) {
  return new Date(date)
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');
}

// A link that opens Google Calendar's "create event" form pre-filled. No OAuth
// scope needed — it's just a URL the browser opens in a new tab.
export function buildGoogleCalendarUrl({ title, details, start, durationMins = 60 }) {
  const startDate = new Date(start);
  const endDate = new Date(startDate.getTime() + durationMins * 60_000);
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: title || 'A-Meet meeting',
    dates: `${toGCalStamp(startDate)}/${toGCalStamp(endDate)}`,
    details: details || '',
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

// Plain-text invite for pasting into chat/email.
export function buildInviteText({ title, when, joinUrl }) {
  const lines = [];
  if (title) lines.push(title);
  if (when) lines.push(`When: ${when}`);
  lines.push(`Join: ${joinUrl}`);
  return lines.join('\n');
}
