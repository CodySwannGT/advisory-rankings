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
export function el(tag, attrs = {}, ...children) {
	const node = document.createElement(tag);
	for (const [k, v] of Object.entries(attrs || {})) {
		if (v == null || v === false) continue;
		if (k === 'class' || k === 'className') node.className = v;
		else if (k === 'dataset') Object.assign(node.dataset, v);
		else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
		else if (k === 'html') node.innerHTML = v;
		else node.setAttribute(k, v);
	}
	for (const child of children.flat(Infinity)) {
		if (child == null || child === false) continue;
		node.appendChild(typeof child === 'string' || typeof child === 'number'
			? document.createTextNode(String(child))
			: child);
	}
	return node;
}

export function clear(node) {
	while (node.firstChild) node.removeChild(node.firstChild);
}
