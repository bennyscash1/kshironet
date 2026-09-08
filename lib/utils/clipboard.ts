/**
 * Copies text to the clipboard, returning whether it worked.
 *
 * TWO PATHS, because the modern one is not always available. `navigator.clipboard` is
 * undefined on an insecure origin (this app is reached over plain HTTP inside the network,
 * where only `localhost` counts as secure), and its promise rejects outright if the browser
 * decides the call was not driven by a user gesture. The `execCommand("copy")` fallback is
 * deprecated but still implemented everywhere and works in exactly those cases, so the
 * button keeps working rather than failing silently on the machines that actually use it.
 *
 * Returns false instead of throwing: every caller wants to show a toast, not handle an
 * exception.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall through — a rejection here is usually permissions or a non-secure origin,
      // both of which the legacy path can still handle.
    }
  }
  return legacyCopy(text);
}

/** Pre-Clipboard-API copy: a selected off-screen textarea plus `execCommand`. */
function legacyCopy(text: string): boolean {
  if (typeof document === "undefined") return false;
  const area = document.createElement("textarea");
  area.value = text;
  // Off-screen rather than hidden: `display:none` / `visibility:hidden` elements cannot be
  // selected, so the copy would silently produce an empty clipboard.
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.top = "-9999px";
  area.style.opacity = "0";
  document.body.appendChild(area);
  try {
    area.select();
    // iOS Safari ignores select() on a readonly field unless the range is set explicitly.
    area.setSelectionRange(0, text.length);
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    document.body.removeChild(area);
  }
}
