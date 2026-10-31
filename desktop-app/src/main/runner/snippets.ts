/**
 * Pure builders for the JavaScript snippets executed in the target page via
 * `webContents.executeJavaScript`. Kept free of Electron imports so unit tests
 * can assert their behavior markers directly.
 *
 * Every dynamic string is embedded with `JSON.stringify` so selectors and
 * values containing quotes cannot break out of the snippet.
 */

function lit(value: string): string {
  return JSON.stringify(value)
}

/**
 * Real visibility probe for `target_visible`: the element must exist, be
 * connected, have a non-zero bounding rect, and pass computed
 * visibility/display/opacity.
 */
export function visibleSnippet(selector: string): string {
  return `(() => {
  const el = document.querySelector(${lit(selector)});
  if (!el || !el.isConnected) return false;
  const rect = el.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return false;
  const style = window.getComputedStyle(el);
  if (style.display === 'none') return false;
  if (style.visibility === 'hidden' || style.visibility === 'collapse') return false;
  if (parseFloat(style.opacity) === 0) return false;
  return true;
})()`
}

/** Text probe. Returns the element text (capped) or null when missing. */
export function textSnippet(selector: string): string {
  return `(() => { const el = document.querySelector(${lit(selector)}); return el ? (el.textContent ?? '').slice(0, 5000) : null; })()`
}

/** Value probe. Returns the element value when it is a string, else null. */
export function valueSnippet(selector: string): string {
  return `(() => { const el = document.querySelector(${lit(selector)}); const v = el?.value; return typeof v === 'string' ? v : null; })()`
}

/** Click action. Throws when the element is missing. */
export function clickSnippet(selector: string): string {
  return `(() => { const el = document.querySelector(${lit(selector)}); if (!el) throw new Error('missing ' + ${lit(selector)}); el.scrollIntoView({ block: 'nearest' }); el.click(); })()`
}

/**
 * Fill action. Writes through the native value setter (so framework bindings
 * observe the change) and dispatches bubbling input + change events.
 */
export function fillSnippet(selector: string, value: string): string {
  return `(() => {
  const el = document.querySelector(${lit(selector)});
  if (!el || !('value' in el)) throw new Error('cannot fill ' + ${lit(selector)});
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype
    : el instanceof HTMLSelectElement ? null : HTMLInputElement.prototype;
  if (proto) {
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    if (setter) setter.call(el, ${lit(value)});
    else el.value = ${lit(value)};
  } else {
    el.value = ${lit(value)};
  }
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
})()`
}

/** Submit action. Resolves the owning form and request-submits it. */
export function submitSnippet(selector: string): string {
  return `(() => {
  const el = document.querySelector(${lit(selector)});
  const form = el instanceof HTMLFormElement ? el : el?.closest('form');
  if (!form) throw new Error('cannot submit ' + ${lit(selector)} + ': no form');
  form.requestSubmit();
})()`
}
