// AdvisorBook · Atomic Design — DOM helpers
//
// Lowest-level DOM creation utilities used by every layer of the
// design system. Keep this file dependency-free — only browser
// globals (document, etc.).

/**
 * Attribute values accepted by {@link el}. Strings/numbers/booleans/null
 * map to HTML attributes (false/null skips the attribute). Functions are
 * registered as event listeners when the key starts with `on…`.
 * `dataset` accepts a plain string-map merged into `element.dataset`.
 */
export type DomAttrValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | EventListenerOrEventListenerObject
  | Readonly<Record<string, string>>;

/**
 * Attribute bag for {@link el}. Special keys:
 * - `class` / `className` → `element.className`
 * - `dataset` → merged into `element.dataset`
 * - `on…` (e.g. `onClick`, `onSubmit`) → `addEventListener('click' | …)`
 * - `html` → `innerHTML` (use sparingly)
 * - any other key → `setAttribute(key, value)`
 */
export type DomAttrs = Readonly<Record<string, DomAttrValue>>;

/**
 * Acceptable child values passed to {@link el}. Strings/numbers become
 * text nodes; `null` / `false` / `undefined` are skipped; nested arrays
 * are flattened to arbitrary depth.
 */
export type DomChild =
  | Node
  | string
  | number
  | null
  | false
  | undefined
  | DomChildArray;

/**
 * Recursive helper for {@link DomChild} — nested arrays of children, to
 * arbitrary depth. Named separately so {@link DomChild} avoids a forward
 * self-reference.
 */
export interface DomChildArray extends ReadonlyArray<DomChild> {}

/**
 * Selects the first element matching `sel` within `root`.
 * @param sel - CSS selector to match.
 * @param root - Root node to search within. Defaults to `document`.
 * @returns The first matching element, or `null` if none match.
 */
export const $ = <T extends Element = Element>(
  sel: string,
  root: ParentNode = document
): T | null => root.querySelector<T>(sel);

/**
 * Terse hyperscript-style element builder.
 *
 * `attrs.class` / `attrs.className` → `element.className`.
 * `attrs.dataset` → `Object.assign(element.dataset, …)`.
 * `attrs.onClick` / `onSubmit` / … → `addEventListener('click' | …)`.
 * `attrs.html` → `innerHTML` (use sparingly).
 * Any other key → `setAttribute(key, value)`.
 *
 * Children: strings/numbers become text nodes; `null`/`false`/`undefined`
 * are skipped; nested arrays are flattened.
 *
 * @param tag - HTML tag name (intrinsic key of `HTMLElementTagNameMap`).
 * @param attrs - Element attributes; see above for special keys.
 * @param children - Child nodes or text values.
 * @returns The created DOM element with attributes and children applied.
 */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs?: DomAttrs,
  ...children: readonly DomChild[]
): HTMLElementTagNameMap[K];
export function el(
  tag: string,
  attrs?: DomAttrs,
  ...children: readonly DomChild[]
): HTMLElement;
export function el(
  tag: string,
  attrs: DomAttrs = {},
  ...children: readonly DomChild[]
): HTMLElement {
  const node = document.createElement(tag);
  const flat: readonly (Node | string)[] = children
    .flat(Infinity as 0) // typed as a fully-flattened array of DomChild leaves
    .filter(
      (child): child is Node | string | number =>
        child != null && child !== false
    )
    .map(child =>
      typeof child === "string" || typeof child === "number"
        ? document.createTextNode(String(child))
        : child
    );
  Object.entries(attrs).forEach(([k, v]) => applyAttr(node, k, v));
  node.append(...flat);
  return node;
}

/**
 * Removes all child nodes from a DOM container before rerendering.
 * @param node - DOM node to update.
 */
export function clear(node: Node): void {
  (node as ParentNode).replaceChildren();
}

const applyAttr = (
  node: HTMLElement,
  key: string,
  value: DomAttrValue
): void => {
  if (value == null || value === false) return;
  if (key === "class" || key === "className") {
    Object.assign(node, { className: String(value) });
    return;
  }
  if (key === "dataset") {
    Object.assign(node.dataset, value as Readonly<Record<string, string>>);
    return;
  }
  if (key.startsWith("on") && typeof value === "function") {
    node.addEventListener(
      key.slice(2).toLowerCase(),
      value as EventListenerOrEventListenerObject
    );
    return;
  }
  if (key === "html") {
    Object.assign(node, { innerHTML: String(value) });
    return;
  }
  node.setAttribute(key, String(value));
};
