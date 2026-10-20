// Whether a key press is going into a field, where single-key shortcuts must stay out of the way.
export function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false
  }

  return (
    target.isContentEditable ||
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT"
  )
}

// A dialog or an open menu owns the keyboard until it closes, so the page behind it shouldn't
// react to n, d or a go-to chord.
export function isOverlayOpen() {
  return document.querySelector('[role="dialog"], [role="alertdialog"], [role="menu"]') !== null
}

// Whether a single-key shortcut should be ignored for this event: the key is repeating, something
// already handled it, the user is typing, or an overlay is open.
export function shouldIgnoreSingleKey(event: KeyboardEvent) {
  return event.repeat || event.defaultPrevented || isTypingTarget(event.target) || isOverlayOpen()
}
