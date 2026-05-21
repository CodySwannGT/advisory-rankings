// @ts-nocheck
// Sign-in page.
// All UI comes from the design system — see docs/design-system.md.

import { postJson, refreshMe, search } from './app.js';
import {
	mountCenteredNarrowPage, el,
	SectionCard, Heading, Button, TextInput, LabeledField, EmptyText,
} from './design-system/index.js';

mountCenteredNarrowPage({
	active: 'home',
	refreshMe,
	search,
	build({ center }) {
		const error = el('div', {
			class: 'ab-empty',
			style: 'display:none; color: var(--ab-color-danger); margin-top: 8px;',
		});
		const submit = Button({
			variant: 'primary',
			type: 'submit',
			children: 'Sign in',
		});
		const email = TextInput({ type: 'email', name: 'email', autocomplete: 'username', required: true, placeholder: 'you@example.com' });
		const password = TextInput({ type: 'password', name: 'password', autocomplete: 'current-password', required: true });

		const form = el('form', {
			onSubmit: async (e) => {
				e.preventDefault();
				error.style.display = 'none';
				submit.disabled = true;
				submit.textContent = 'Signing in…';
				try {
					await postJson('/Login', { email: email.value, password: password.value });
					await refreshMe();
					location.href = 'index.html';
				} catch (err) {
					error.textContent = /401/.test(String(err)) ? 'Invalid email or password.' : String(err.message || err);
					error.style.display = 'block';
				} finally {
					submit.disabled = false;
					submit.textContent = 'Sign in';
				}
			},
		},
			LabeledField({ label: 'Email', input: email }),
			LabeledField({ label: 'Password', input: password }),
			el('div', { style: 'margin-top: 16px;' }, submit),
			error,
		);

		center.appendChild(SectionCard({
			body: [
				Heading({ level: 2, attrs: { class: 'card-title' }, children: 'Sign in' }),
				el('p', {
					class: 'sub',
					style: 'color: var(--ab-color-text-muted); margin: 0 0 16px; font-size: var(--ab-font-size-base);',
				}, 'You can browse advisors, firms and teams without signing in. Sign in to manage data.'),
				form,
			],
		}));

		setTimeout(() => email.focus(), 50);
	},
});
