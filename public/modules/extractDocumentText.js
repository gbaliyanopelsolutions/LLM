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
 * @param {File} file
 * @returns {Promise<string>}
 */
async function extractDocx(file) {
	const mammoth = /** @type {{ extractRawText: (o: { arrayBuffer: ArrayBuffer }) => Promise<{ value: string }> } | undefined} */ (
		window.mammoth
	);
	if (!mammoth) {
		throw new Error('DOCX support failed to load. Refresh the page and try again.');
	}
	const arrayBuffer = await file.arrayBuffer();
	const result = await mammoth.extractRawText({ arrayBuffer });
	return String(result.value || '').trim();
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
export async function extractTextFromFile(file) {
	validateUploadFile(file);
	const ext = getFileExtension(file);

	if (ext === '.txt') {
		return extractTxt(file);
	}
	if (ext === '.docx') {
		return extractDocx(file);
	}
	if (ext === '.pdf') {
		return extractPdf(file);
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
 * Document text is cleaned and hard-capped at MAX_DOC_CHARS before sending.
 *
 * @param {string} userPrompt
 * @param {string} documentText
 * @param {string} [fileName]
 * @returns {string}
 */
export function buildEffectivePrompt(userPrompt, documentText, fileName = '') {
	const manual = String(userPrompt || '').trim();
	const cleaned = cleanDocumentText(documentText);
	const label  = fileName ? ` "${fileName}"` : '';

	/* ── No document uploaded ── */
	if (!cleaned) {
		return manual;
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
		].join('\n\n');
	}

	/* ── Both document + extra prompt ── */
	return [
		`Generate a survey from the document${label} below. Apply ALL requirements listed after it.`,
		`====== DOCUMENT${label} ======`,
		docBlock,
		'====== END DOCUMENT ======',
		'',
		'====== REQUIREMENTS (MANDATORY — follow every item) ======',
		manual,
		'====== END REQUIREMENTS ======',
	].join('\n\n');
}
