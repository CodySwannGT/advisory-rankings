// @ts-nocheck
// AdvisorBook · Atomic Design — DOM helpers
//
// Lowest-level DOM creation utilities used by every layer of the
// design system. Keep this file dependency-free — only browser
// globals (document, etc.).

export const $ = (sel, root = document) => root.querySelector(sel);

// el(tag, attrs?, ...children) — terse hyperscript-style builder.
//   attrs.class / attrs.className → element.className
//   attrs.dataset                  → Object.assign(element.dataset, …)
//   attrs.onClick / onSubmit / …   → addEventListener('click' | …)
//   attrs.html                     → innerHTML (use sparingly)
//   any other key                  → setAttribute(key, value)
//   children: strings/numbers become text nodes; null/false/undefined
//             are skipped; nested arrays are flattened.
/**
 * Handles el for this workflow.
 * @param tag - HTML tag name.
 * @param attrs - Element attributes.
 * @param {...any} children - Child nodes or text values.
 * @returns Created DOM element with attributes and children applied.
 */
export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  Object.entries(attrs || {}).forEach(([k, v]) => applyAttr(node, k, v));
  children
    .flat(Infinity)
    .filter(child => child != null && child !== false)
    .forEach(child =>
      node.appendChild(
        typeof child === "string" || typeof child === "number"
          ? document.createTextNode(String(child))
          : child
      )
    );
  return node;
}

/**
 * Removes all child nodes from a DOM container before rerendering.
 * @param node - DOM node to update.
 */
export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}

const applyAttr = (node, key, value) => {
  if (value == null || value === false) return;
  if (key === "class" || key === "className")
    Object.assign(node, { className: value });
  else if (key === "dataset") Object.assign(node.dataset, value);
  else if (key.startsWith("on") && typeof value === "function")
    node.addEventListener(key.slice(2).toLowerCase(), value);
  else if (key === "html") Object.assign(node, { innerHTML: value });
  else node.setAttribute(key, value);
};
