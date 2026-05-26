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
 * Leaf values produced by flattening a {@link DomChild}. After
 * flattening, every entry is either a DOM node, a primitive text value,
 * or a skip-marker (`null` / `false` / `undefined`).
 */
export type DomChildLeaf = Node | string | number | false | null | undefined;

/**
 * Acceptable child values passed to {@link el}. Strings/numbers become
 * text nodes; `null` / `false` / `undefined` are skipped. A single level
 * of array nesting is flattened — call sites that need deeper nesting
 * must spread their own arrays at the boundary (the established pattern
 * across `src/web/`, where helpers like `arrify(...)` and
 * `headings.map(...)` are always spread into `el(...)`).
 */
export type DomChild = DomChildLeaf | readonly DomChildLeaf[];

/**
 * Narrows a {@link DomChild} to the single-level array branch.
 * Combined with `Array.isArray`'s runtime check, this produces a sound
 * narrowing that distinguishes nested arrays from leaf values without a
 * cast.
 * @param child - Candidate child value.
 * @returns `true` when `child` is an array of {@link DomChildLeaf}.
 */
function isLeafArray(child: DomChild): child is readonly DomChildLeaf[] {
  return Array.isArray(child);
}

/**
 * Flattens a one-level {@link DomChild} sequence into the leaf form
 * consumed by `el`'s child pipeline, preserving left-to-right source
 * order. Replaces the previous `Array.prototype.flat(Infinity)` call so
 * the depth is bounded by the actual data — and asserted by the type
 * system rather than a `flat<0>` cast.
 * @param children - Child sequence to flatten.
 * @returns Flat sequence of {@link DomChildLeaf} entries in source order.
 */
function flattenChildren(
  children: readonly DomChild[]
): readonly DomChildLeaf[] {
  return children.flatMap(child => (isLeafArray(child) ? child : [child]));
}

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
  const flat: readonly (Node | string)[] = flattenChildren(children)
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
 * @param node - Parent DOM node to empty.
 */
export function clear(node: ParentNode): void {
  node.replaceChildren();
}

/**
 * Narrows a {@link DomAttrValue} to the plain string-map shape accepted
 * by `element.dataset`. Excludes primitives and functions.
 * @param value - Candidate attribute value.
 * @returns `true` when `value` is a plain object suitable for `dataset`.
 */
function isDatasetMap(
  value: DomAttrValue
): value is Readonly<Record<string, string>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Narrows a {@link DomAttrValue} to the event-listener shape accepted by
 * `addEventListener`. A function value is treated as a listener for any
 * `on…` attribute key.
 * @param value - Candidate attribute value.
 * @returns `true` when `value` is callable.
 */
function isEventListener(
  value: DomAttrValue
): value is EventListenerOrEventListenerObject {
  return typeof value === "function";
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
  if (key === "dataset" && isDatasetMap(value)) {
    Object.assign(node.dataset, value);
    return;
  }
  if (key.startsWith("on") && isEventListener(value)) {
    node.addEventListener(key.slice(2).toLowerCase(), value);
    return;
  }
  if (key === "html") {
    Object.assign(node, { innerHTML: String(value) });
    return;
  }
  node.setAttribute(key, String(value));
};
