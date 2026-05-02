import { el, mountPage, postJson, refreshMe } from './app.js';

mountPage({
	active: 'home',
	build(layout) {
		const center = el('section', { class: 'center', style: 'grid-column: 1 / -1; max-width: 420px; margin: 32px auto;' });
		layout.appendChild(center);

		const error = el('div', { class: 'empty', style: 'display:none; color: var(--accent-red); margin-top: 8px;' });
		const submit = el('button', {
			type: 'submit',
			class: 'me-action',
			style: 'width:100%; padding:10px 14px; font-size:15px; background:var(--brand); color:#fff;',
		}, 'Sign in');
		const email = el('input', { type: 'email', name: 'email', autocomplete: 'username', required: true, placeholder: 'you@example.com' });
		const password = el('input', { type: 'password', name: 'password', autocomplete: 'current-password', required: true });

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
			labeled('Email', email),
			labeled('Password', password),
			el('div', { style: 'margin-top: 16px;' }, submit),
			error,
		);

		center.appendChild(el('div', { class: 'card' },
			el('div', { class: 'card-body' },
				el('h2', { class: 'card-title' }, 'Sign in'),
				el('p', { class: 'sub', style: 'color: var(--text-muted); margin: 0 0 16px; font-size: 14px;' },
					'You can browse advisors, firms and teams without signing in. Sign in to manage data.'),
				form,
			),
		));

		setTimeout(() => email.focus(), 50);
	},
});

function labeled(label, input) {
	Object.assign(input.style, {
		width: '100%',
		padding: '10px 12px',
		fontSize: '15px',
		border: '1px solid var(--border)',
		borderRadius: '8px',
		marginTop: '4px',
		boxSizing: 'border-box',
	});
	return el('label', { style: 'display:block; margin-bottom: 12px; font-size: 13px; font-weight: 600; color: var(--text-muted);' },
		label,
		input,
	);
}
