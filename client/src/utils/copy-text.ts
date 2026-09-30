function copyWithCommand(text: string): boolean {
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.top = '0';
  area.style.left = '0';
  area.style.opacity = '0';
  document.body.appendChild(area);
  area.focus();
  area.select();
  const command = document.execCommand;
  try {
    if (typeof command !== 'function') return false;
    return command.call(document, 'copy');
  } catch {
    return false;
  } finally {
    area.remove();
  }
}

/** True when `text` reached the clipboard. Falls back when the async API is missing or denied. */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Permission denied or a non-secure context. The synchronous path below
    // still works from the same user gesture in those browsers.
  }
  return copyWithCommand(text);
}
