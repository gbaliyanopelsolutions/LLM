/**
 * Renders public survey question blocks to match the builder Live Preview canvas
 * (spacing, typography, controls).
 */

/**
 * @param {unknown} opts
 * @returns {string[]}
 */
export function readOptions(opts) {
	if (!opts || typeof opts !== 'object') return [];
	const o = /** @type {{ options?: unknown }} */ (opts).options;
	if (!Array.isArray(o)) return [];
	return o.map((x) => String(x));
}

/**
 * @param {{ question_id: string, question_text: string, type: string, options_json?: object }} q
 * @returns {HTMLElement}
 */
export function renderQuestion(q) {
	const wrap = document.createElement('div');
	wrap.className = 'preview-field-block';

	const opts = q.options_json && typeof q.options_json === 'object' ? q.options_json : {};
	const required = Boolean(opts.required);
	const options = readOptions(opts);

	const label = document.createElement('label');
	label.className = 'preview-field-label';
	label.htmlFor = `q-${q.question_id}`;
	label.textContent = q.question_text;
	if (required) {
		const span = document.createElement('span');
		span.className = 'preview-req';
		span.textContent = ' *';
		label.appendChild(span);
	}

	const type = String(q.type || 'text');

	if (type === 'single_choice' || type === 'multiple_choice') {
		wrap.appendChild(label);
		const name = `q-${q.question_id}`;
		options.forEach((opt, i) => {
			const row = document.createElement('label');
			row.className = 'preview-opt-row';
			const input = document.createElement('input');
			input.className = 'preview-opt-input';
			input.type = type === 'multiple_choice' ? 'checkbox' : 'radio';
			input.name = name;
			input.value = opt;
			if (required && type === 'single_choice' && i === 0) input.required = true;
			row.appendChild(input);
			const span = document.createElement('span');
			span.textContent = opt;
			row.appendChild(span);
			wrap.appendChild(row);
		});
		if (!options.length) {
			const p = document.createElement('p');
			p.className = 'preview-muted';
			p.textContent = 'No options configured.';
			wrap.appendChild(p);
		}
		return wrap;
	}

	if (type === 'text') {
		wrap.appendChild(label);
		const ta = document.createElement('textarea');
		ta.className = 'preview-text-control';
		ta.id = `q-${q.question_id}`;
		ta.name = q.question_id;
		ta.rows = 3;
		if (required) ta.required = true;
		wrap.appendChild(ta);
		return wrap;
	}

	if (type === 'number') {
		wrap.appendChild(label);
		const inp = document.createElement('input');
		inp.className = 'preview-text-control preview-text-control--inline';
		inp.type = 'number';
		inp.id = `q-${q.question_id}`;
		inp.name = q.question_id;
		if (required) inp.required = true;
		wrap.appendChild(inp);
		return wrap;
	}

	if (type === 'date') {
		wrap.appendChild(label);
		const inp = document.createElement('input');
		inp.className = 'preview-text-control preview-text-control--inline';
		inp.type = 'date';
		inp.id = `q-${q.question_id}`;
		inp.name = q.question_id;
		if (required) inp.required = true;
		wrap.appendChild(inp);
		return wrap;
	}

	wrap.appendChild(label);
	const inp = document.createElement('input');
	inp.className = 'preview-text-control preview-text-control--inline';
	inp.type = 'text';
	inp.id = `q-${q.question_id}`;
	inp.name = q.question_id;
	if (required) inp.required = true;
	wrap.appendChild(inp);
	return wrap;
}
