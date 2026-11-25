import { useEffect } from "react";

/* What a dialog or a sheet owes the keyboard: Tab stays inside it while it is open, and the
 * focus goes back to where it was once it has closed. */

const STOPS = 'a[href], summary, button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Keeps Tab inside `root`: from its last control round to its first, and back. For the
 *  `keydown` of whatever is open over the page. */
export function wrapTab(e: { key: string; shiftKey: boolean; preventDefault: () => void }, root: HTMLElement | null) {
  if (e.key !== "Tab" || !root) return;
  /* only what Tab would stop at: a group that keeps one tab stop among its cells keeps it here */
  /* what lies in a shut <details> has a place on the page and yet takes no focus */
  const stops = [...root.querySelectorAll<HTMLElement>(STOPS)].filter((el) => el.tabIndex >= 0 && el.getClientRects().length > 0 && (el.checkVisibility?.() ?? true));
  if (stops.length === 0) return;
  const at = stops.indexOf(document.activeElement as HTMLElement);
  const next = stops[(at + (e.shiftKey ? -1 : 1) + stops.length) % stops.length];
  e.preventDefault();
  next.focus();
}

/** Remembers what had the focus when something opens over the page, and gives it back when
 *  that closes: the button that opened a dialog is where the keyboard carries on. */
export function useFocusReturn(open: boolean) {
  useEffect(() => {
    if (!open) return;
    const before = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    return () => {
      if (before?.isConnected) before.focus({ preventScroll: true });
    };
  }, [open]);
}
