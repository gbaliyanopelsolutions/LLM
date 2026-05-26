/**
 * Extract plain text from uploaded survey requirement documents (browser).
 */

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/** @type {readonly string[]} */
export const ALLOWED_EXTENSIONS = Object.freeze(['.txt', '.docx', '.pdf']);

const EXT_MIME = {
	'.txt': ['text/plain', 'application/octet-stream'],
	'.docx': [
		'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
		'application/octet-stream',
	],
	'.pdf': ['application/pdf', 'application/octet-stream'],
};

/**
 * @param {string} name
 * @returns {string}
 */
function extensionFromName(name) {
	const i = String(name || '').lastIndexOf('.');
	return i >= 0 ? String(name).slice(i).toLowerCase() : '';
}

/**
 * @param {File} file
 * @returns {string}
 */
export function getFileExtension(file) {
	return extensionFromName(file.name);
}

/**
 * @param {File} file
 * @returns {void}
 */
export function validateUploadFile(file) {
	if (!file) {
		throw new Error('No file selected.');
	}
	const ext = getFileExtension(file);
	if (!ALLOWED_EXTENSIONS.includes(ext)) {
		throw new Error('Allowed types: .txt, .docx, .pdf');
	}
	if (file.size > MAX_UPLOAD_BYTES) {
		throw new Error('File must be 10 MB or smaller.');
	}
	if (file.size === 0) {
		throw new Error('File is empty.');
	}
	const allowedMimes = EXT_MIME[ext];
	if (file.type && allowedMimes && !allowedMimes.includes(file.type)) {
		/* Some browsers omit or misreport MIME; extension is primary. */
	}
}

/**
 * @param {File} file
 * @returns {Promise<string>}
 */
async function extractTxt(file) {
	const text = await file.text();
	return text.trim();
}

/**
 * Strip Qualtrics Q-number prefix and trailing value labels from a string.
 * @param {string} s
 * @returns {string}
 */
function cleanLabel(s) {
	return String(s || '')
		.replace(/^Q\d+[\s.]+/i, '')
		.replace(/(\s*\(\d+\))+\s*$/, '')
		.trim();
}

/**
 * Parse mammoth HTML output to pre-detect matrix/table questions.
 * Returns an array of matrix descriptors that are injected into the AI prompt
 * so Claude never has to guess about matrix structure from raw text.
 *
 * @param {string} html - HTML string from mammoth.convertToHtml
 * @returns {Array<{question:string, rows:string[], min:number, max:number}>}
 */
function detectMatricesFromDocxHtml(html) {
	if (!html || typeof window === 'undefined') return [];
	try {
		const doc = new DOMParser().parseFromString(html, 'text/html');
		/** @type {Array<{question:string, rows:string[], min:number, max:number}>} */
		const found = [];
		let lastPara = '';

		for (const el of Array.from(doc.body.children)) {
			const tag = el.tagName.toLowerCase();

			if (tag === 'table') {
				const trs = Array.from(el.querySelectorAll('tr'));
				if (trs.length < 2) { lastPara = ''; continue; }

				// Header row cells (skip first – it's the row-label column)
				const hdrCells = Array.from(trs[0].querySelectorAll('td,th')).slice(1);
				const hdrTexts = hdrCells.map((c) => c.textContent.trim()).filter(Boolean);

				// Need ≥3 scale cells containing numbers
				const nums = hdrTexts.map((t) => {
					const m = t.match(/\d+/);
					return m ? parseInt(m[0], 10) : NaN;
				}).filter((n) => !isNaN(n));

				if (nums.length < 3) { lastPara = ''; continue; }

				const min = Math.min(...nums);
				const max = Math.max(...nums);

				// Row labels (first cell of every body row)
				const rows = trs.slice(1).map((tr) => {
					const first = tr.querySelector('td,th');
					return first ? cleanLabel(first.textContent.trim()) : '';
				}).filter(Boolean);

				if (rows.length >= 2 && lastPara) {
					found.push({ question: cleanLabel(lastPara), rows, min, max });
				}
				lastPara = '';
				continue;
			}

			const txt = el.textContent.trim();
			if (txt) lastPara = txt;
		}
		return found;
	} catch (e) {
		console.warn('[detectMatrices] error:', e);
		return [];
	}
}

/**
 * @param {File} file
 * @returns {Promise<{ text: string, matrices: Array<{question:string, rows:string[], min:number, max:number}> }>}
 */
async function extractDocx(file) {
	const mammoth = /** @type {{ extractRawText: Function, convertToHtml: Function } | undefined} */ (
		window.mammoth
	);
	if (!mammoth) {
		throw new Error('DOCX support failed to load. Refresh the page and try again.');
	}
	const arrayBuffer = await file.arrayBuffer();

	// Run both extractions in parallel
	const [textResult, htmlResult] = await Promise.all([
		mammoth.extractRawText({ arrayBuffer }),
		mammoth.convertToHtml({ arrayBuffer }).catch(() => ({ value: '' })),
	]);

	const text = String(textResult.value || '').trim();
	const html = String(htmlResult.value || '').trim();
	const matrices = detectMatricesFromDocxHtml(html);

	console.log('[DOCX] extracted text chars:', text.length, '| detected matrices:', matrices.length);
	if (matrices.length) console.log('[DOCX] matrices →', matrices);

	return { text, matrices };
}

/**
 * @param {File} file
 * @returns {Promise<string>}
 */
async function extractPdf(file) {
	const pdfjs = await import(
		'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/build/pdf.min.mjs'
	);
	pdfjs.GlobalWorkerOptions.workerSrc =
		'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/build/pdf.worker.min.mjs';

	const data = await file.arrayBuffer();
	const loadingTask = pdfjs.getDocument({ data });
	const pdf = await loadingTask.promise;
	const parts = [];

	for (let pageNum = 1; pageNum <= pdf.numPages; pageNum += 1) {
		const page = await pdf.getPage(pageNum);
		const content = await page.getTextContent();
		const line = content.items
			.map((item) => ('str' in item ? String(item.str) : ''))
			.join(' ')
			.trim();
		if (line) {
			parts.push(line);
		}
	}

	return parts.join('\n\n').trim();
}

/**
 * @param {File} file
 * @returns {Promise<string>}
 */
/**
 * Extract text and optional structural hints from an uploaded file.
 *
 * For .docx files, returns { text: string, matrices: Array } where
 * `matrices` contains pre-detected matrix questions extracted from DOCX tables.
 *
 * For all other types, returns { text: string, matrices: [] }.
 *
 * @param {File} file
 * @returns {Promise<{ text: string, matrices: Array<{question:string, rows:string[], min:number, max:number}> }>}
 */
export async function extractTextFromFile(file) {
	validateUploadFile(file);
	const ext = getFileExtension(file);

	if (ext === '.txt') {
		const text = await extractTxt(file);
		return { text, matrices: [] };
	}
	if (ext === '.docx') {
		// extractDocx now returns { text, matrices }
		return extractDocx(file);
	}
	if (ext === '.pdf') {
		const text = await extractPdf(file);
		return { text, matrices: [] };
	}

	throw new Error('Unsupported file type.');
}

/**
 * Maximum characters of document text sent to the AI.
 * Keeps the total prompt well inside the 30 k token/min rate limit.
 */
const MAX_DOC_CHARS = 12_000;

/**
 * Collapse redundant whitespace in extracted document text to reduce token count.
 * Also strips Qualtrics-specific artefacts (block markers, page-break labels,
 * survey-platform metadata) that confuse the AI and appear verbatim in forms.
 * @param {string} raw
 * @returns {string}
 */
function cleanDocumentText(raw) {
	return String(raw || '')
		// Remove Qualtrics block markers: "Start of Block: Welcome", "End of Block: B3"
		.replace(/^(Start|End)\s+of\s+Block\s*:[^\n]*/gim, '')
		// Remove "Page Break" lines
		.replace(/^Page\s+Break\s*$/gim, '')
		// Remove Qualtrics display logic / embedded data lines
		.replace(/^Display\s+Logic\s*:[^\n]*/gim, '')
		// Remove survey-platform meta lines (e.g. "Timing First Click" Qualtrics columns)
		.replace(/^Timing\s+First\s+Click[^\n]*/gim, '')
		.replace(/[ \t]+/g, ' ')        // collapse horizontal whitespace
		.replace(/\n[ \t]+/g, '\n')     // strip leading whitespace on each line
		.replace(/\n{3,}/g, '\n\n')     // collapse 3+ blank lines → 1 blank line
		.trim();
}

/**
 * Merge manual prompt with extracted document text for the LLM.
 *
 * Rules:
 *  - doc only  → lightweight extraction request
 *  - manual only → pass through unchanged
 *  - both       → structured prompt: doc first, then user instructions as MANDATORY
 *
 * `matrixHints` is an optional array of pre-detected matrix structures from the
 * DOCX HTML pass.  When present they are appended as a "PRE-DETECTED MATRIX" block
 * so Claude can copy the rows/scale exactly rather than guessing from raw text.
 *
 * Document text is cleaned and hard-capped at MAX_DOC_CHARS before sending.
 *
 * @param {string} userPrompt
 * @param {string} documentText
 * @param {string} [fileName]
 * @param {Array<{question:string, rows:string[], min:number, max:number}>} [matrixHints]
 * @returns {string}
 */
export function buildEffectivePrompt(userPrompt, documentText, fileName = '', matrixHints = []) {
	const manual = String(userPrompt || '').trim();
	const cleaned = cleanDocumentText(documentText);
	const label  = fileName ? ` "${fileName}"` : '';

	/* ── Build optional matrix hints block ── */
	let matrixBlock = '';
	if (Array.isArray(matrixHints) && matrixHints.length > 0) {
		const lines = matrixHints.map((m, i) => {
			const rowList = m.rows.map((r) => `  - ${r}`).join('\n');
			return `MATRIX ${i + 1}:\n  Question: "${m.question}"\n  Scale: ${m.min}–${m.max}\n  Rows:\n${rowList}`;
		});
		matrixBlock = [
			'',
			'====== PRE-DETECTED MATRIX QUESTIONS (use type "matrix_rating", exact rows, exact scale) ======',
			lines.join('\n\n'),
			'====== END MATRIX HINTS ======',
		].join('\n');
	}

	/* ── No document uploaded ── */
	if (!cleaned) {
		return manual + matrixBlock;
	}

	const docBlock = cleaned.length > MAX_DOC_CHARS
		? `${cleaned.slice(0, MAX_DOC_CHARS)}\n…(truncated)`
		: cleaned;

	/* ── Document only, no extra prompt ── */
	if (!manual) {
		return [
			`Extract ALL survey questions from the document${label} below and generate the survey.`,
			`====== DOCUMENT${label} ======`,
			docBlock,
			'====== END DOCUMENT ======',
			matrixBlock,
		].join('\n\n');
	}

	/* ── Both document + extra prompt ── */
	return [
		`Generate a survey from the document${label} below. Apply ALL requirements listed after it.`,
		`====== DOCUMENT${label} ======`,
		docBlock,
		'====== END DOCUMENT ======',
		matrixBlock,
		'====== REQUIREMENTS (MANDATORY — follow every item) ======',
		manual,
		'====== END REQUIREMENTS ======',
	].join('\n\n');
}
