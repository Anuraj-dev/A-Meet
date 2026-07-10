import { useCallback, useEffect, useRef, type KeyboardEvent } from 'react';

// Focus management shared by the room's People / Chat panels.
//
// The desktop variants are in-flow, non-modal columns and get no focus handling
// for free. This hook gives both responsive variants the shared dialog baseline:
//   • on open, move focus into the panel (the `initialFocusRef` target — the
//     heading), so screen readers announce the panel and keyboard users land
//     inside it;
//   • on close/unmount, return focus to whatever was focused when the panel
//     opened (the control-bar toggle that invoked it), so keyboard users aren't
//     stranded at the top of the document;
//   • Escape closes the panel (wire `onKeyDown` on the panel container).
export function usePanelDialog<T extends HTMLElement>(onClose: () => void, closeOnEscape = true) {
  const initialFocusRef = useRef<T | null>(null);
  const panelRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    // The invoking control still holds focus at mount time.
    const opener = document.activeElement as HTMLElement | null;
    initialFocusRef.current?.focus();
    const panel = panelRef.current;
    let focusWasInside = Boolean(panel?.contains(document.activeElement));
    const trackFocus = (event: FocusEvent) => {
      const target = event.target as Node | null;
      if (target && panel?.contains(target)) {
        focusWasInside = true;
      } else if (!(target === document.body && panel && !panel.isConnected)) {
        focusWasInside = false;
      }
    };
    document.addEventListener('focusin', trackFocus);
    return () => {
      document.removeEventListener('focusin', trackFocus);
      if (focusWasInside && opener?.isConnected) opener.focus();
    };
  }, []);

  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLElement>) => {
      if (e.key === 'Escape' && closeOnEscape) {
        e.stopPropagation();
        onClose();
      }
    },
    [closeOnEscape, onClose],
  );

  return { initialFocusRef, panelRef, onKeyDown };
}
