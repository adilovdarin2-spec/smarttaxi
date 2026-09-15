// Scope keyboard navigation to a visible modal without destroying the screen
// underneath it. Returning focus never changes route or application state.
export function containModalFocus(root, onClose, documentRef = document) {
  const previous = documentRef.activeElement;
  const focusable = () =>
    [
      ...root.querySelectorAll(
        'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]',
      ),
    ].filter(
      (element) =>
        element.getClientRects().length && !element.closest("[inert]"),
    );
  const focusFirst = () => (focusable()[0] || root).focus();
  const onKeyDown = (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    } else if (event.key === "Tab") {
      const targets = focusable();
      const first = targets[0],
        last = targets[targets.length - 1];
      const current = documentRef.activeElement;
      if (!first) {
        event.preventDefault();
        root.focus();
      } else if (
        event.shiftKey &&
        (current === first || current === root || !root.contains(current))
      ) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        (current === last || !root.contains(current))
      ) {
        event.preventDefault();
        first.focus();
      }
    }
  };
  const onFocusIn = (event) => {
    if (!root.contains(event.target)) focusFirst();
  };
  focusFirst();
  documentRef.addEventListener("keydown", onKeyDown);
  documentRef.addEventListener("focusin", onFocusIn);
  return () => {
    documentRef.removeEventListener("keydown", onKeyDown);
    documentRef.removeEventListener("focusin", onFocusIn);
    if (previous?.isConnected && !previous.closest("[inert]")) previous.focus();
  };
}
