// Google Meet-style room codes are `xxx-xxxx-xxx` (lowercase letters). The join
// field accepts that code, the same three blocks separated by spaces, or a
// pasted lobby/room link. Anything else is rejected so we never navigate to a
// lobby URL that the server will only answer with "check your meeting code".

const ROOM_CODE = /^[a-z]{3}-[a-z]{4}-[a-z]{3}$/;

function normalizeCode(value: string): string | null {
  const compact = value
    .trim()
    .replace(/[?#].*$/, '')
    .toLowerCase()
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/^[<(["'`]+|[>)\]"'`,.;:!?]+$/g, '');
  if (ROOM_CODE.test(compact)) return compact;
  const groups = compact.split(/[\s_-]+/).filter(Boolean);
  if (groups.length === 3 && groups.every((part) => /^[a-z]+$/.test(part))) {
    const joined = groups.join('-');
    if (ROOM_CODE.test(joined)) return joined;
  }
  return null;
}

function stripDecorations(value: string): string {
  return value
    .trim()
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/^[<(["'`]+/, '')
    .replace(/[>)\]"'`,.;:!?]+$/, '')
    .trim();
}

function isUrlAttempt(value: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(value)
    || /^[\w.-]+\.[a-z]{2,}(:\d+)?\//i.test(value)
    || /^(localhost|\d{1,3}(?:\.\d{1,3}){3})(:\d+)?\//i.test(value);
}

function isPathAttempt(value: string): boolean {
  return value.startsWith('/') || /^(lobby|room)\//i.test(value);
}

function codeFromUrl(value: string): string | null {
  let href = value;
  if (value.startsWith('/')) href = `http://local.invalid${value}`;
  else if (/^(lobby|room)\//i.test(value)) href = `http://local.invalid/${value}`;
  else if (!/^[a-z][a-z0-9+.-]*:/i.test(value)) href = `https://${value}`;

  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }

  const segments = url.pathname.split('/').filter(Boolean);
  for (let i = segments.length - 1; i >= 0; i -= 1) {
    const rawSegment = segments[i] ?? '';
    let segment: string;
    try {
      segment = decodeURIComponent(rawSegment);
    } catch {
      segment = rawSegment;
    }
    const code = normalizeCode(segment);
    if (code) return code;
  }
  return null;
}

/**
 * When the join field is a multi-line invite (or other prose), pull out the
 * first lobby/room link token, or else the first standalone room-code token.
 */
function extractEmbeddedMeetingCode(text: string): string | null {
  const tokens = text.split(/\s+/).map(stripDecorations).filter(Boolean);

  for (const token of tokens) {
    if (isUrlAttempt(token) || isPathAttempt(token)) {
      const code = codeFromUrl(token);
      if (code) return code;
    }
  }

  for (const token of tokens) {
    const code = normalizeCode(token);
    if (code) return code;
  }

  return null;
}

/** Meeting code embedded in `raw`, or null when it is not a usable code or link. */
export function parseMeetingCode(raw: string): string | null {
  // Wrappers and zero-width spaces are stripped before the URL check. Otherwise
  // `<https://…/lobby/code>`, a quoted link, or a leading U+200B is treated as
  // a bare code and rejected, and `lobby/code` never reaches the path parser.
  const stripped = stripDecorations(raw);
  if (!stripped) return null;
  if (isUrlAttempt(stripped) || isPathAttempt(stripped)) return codeFromUrl(stripped);
  const asCode = normalizeCode(stripped);
  if (asCode) return asCode;

  // Copy-invite paste is title / When / Join URL — whole-field parse fails, so
  // scan tokens for the lobby/room link (or a bare xxx-xxxx-xxx).
  return extractEmbeddedMeetingCode(stripped);
}
