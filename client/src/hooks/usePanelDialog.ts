import { useCallback, useEffect, useRef, type KeyboardEvent } from 'react';

// Focus management for the room's non-modal side panels (People / Chat).
//
// These panels are in-flow columns, not MUI Modals, so they get no focus
// handling for free. This hook gives them the accessibility baseline a dialog
// needs:
//   • on open, move focus into the panel (the `initialFocusRef` target — the
//     heading), so screen readers announce the panel and keyboard users land
//     inside it;
//   • on close/unmount, return focus to whatever was focused when the panel
//     opened (the control-bar toggle that invoked it), so keyboard users aren't
//     stranded at the top of the document;
//   • Escape closes the panel (wire `onKeyDown` on the panel container).
export function usePanelDialog<T extends HTMLElement>(onClose: () => void) {
  const initialFocusRef = useRef<T | null>(null);

  useEffect(() => {
    // The invoking control still holds focus at mount time.
    const opener = document.activeElement as HTMLElement | null;
    initialFocusRef.current?.focus();
    return () => {
      // Only restore if focus is still inside the (unmounting) panel, so we
      // don't yank focus away from wherever the user has since moved it.
      opener?.focus?.();
    };
  }, []);

  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLElement>) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    },
    [onClose],
  );

  return { initialFocusRef, onKeyDown };
}
