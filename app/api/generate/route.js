import Anthropic from '@anthropic-ai/sdk';
import { NextResponse } from 'next/server';

const SYSTEM_PROMPT = `You are an expert single-file HTML form generator. Your ONLY output is one complete HTML5 document.

Requirements:
- Include ALL CSS inside <style> tags and ALL JavaScript inside <script> tags in that same file.
- Produce production-ready, accessible, responsive forms with clear labels and sensible defaults.
- Infer the best structure from the user's request. Detect and apply appropriate patterns for:
  • Contact / inquiry forms (name, email, message, validation)
  • Survey forms (radio, checkbox, scales, progress)
  • Multi-step forms / wizards (steps, Next/Back, validation per step)
  • Login, signup, and password-reset style flows
  • Checkout or order summaries with shipping/payment-style sections when relevant
- Use semantic HTML5, keyboard-friendly controls, and mobile-friendly layouts.

Strict output rules:
- Output ONLY the raw HTML document. Start with <!DOCTYPE html> or <html>.
- Do NOT wrap output in markdown code fences. Do NOT use markdown at all.
- Do NOT add explanations, apologies, or commentary before or after the HTML.
- Close all tags properly and ensure the page runs standalone in a browser.`;

/** Map retired/malformed IDs to their current replacements. */
const DEPRECATED_MODEL_ALIASES = {
	'claude-sonnet-4-20250514':    'claude-sonnet-4-5',
	'claude-4-sonnet-20250514':    'claude-sonnet-4-5',
	'claude-sonnet-4-5-20250929':  'claude-sonnet-4-5',
};

const DEFAULT_MODEL = 'claude-sonnet-4-5';

/**
 * @param {string|undefined} raw
 * @returns {string}
 */
function resolveModel(raw) {
	const id = typeof raw === 'string' ? raw.trim() : '';
	if (!id) {
		return DEFAULT_MODEL;
	}
	if (Object.prototype.hasOwnProperty.call(DEPRECATED_MODEL_ALIASES, id)) {
		return DEPRECATED_MODEL_ALIASES[id];
	}
	return id;
}

/**
 * @param {string} raw
 * @returns {string}
 */
function extractHtml(raw) {
	let text = String(raw).trim();
	const fence = /^```(?:html)?\s*\n?/i;
	if (fence.test(text)) {
		text = text.replace(fence, '');
		text = text.replace(/\n?```\s*$/i, '');
	}
	return text.trim();
}

/**
 * @param {unknown} raw
 * @returns {Array<{ role: 'user' | 'assistant', content: string }>}
 */
function normalizeHistory(raw) {
	if (!Array.isArray(raw)) {
		return [];
	}
	const out = [];
	for (const item of raw) {
		if (
			item &&
			typeof item === 'object' &&
			(item.role === 'user' || item.role === 'assistant') &&
			typeof item.content === 'string'
		) {
			out.push({ role: item.role, content: item.content });
		}
	}
	return out;
}

/**
 * @param {unknown} err
 * @returns {{ status: number, message: string }}
 */
function formatApiError(err) {
	if (err && typeof err === 'object') {
		const anyErr = err;
		const status =
			typeof anyErr.status === 'number'
				? anyErr.status
				: typeof anyErr.statusCode === 'number'
					? anyErr.statusCode
					: 500;
		let message = 'Generation failed';
		if (typeof anyErr.message === 'string' && anyErr.message) {
			message = anyErr.message;
		}
		if (anyErr.error && typeof anyErr.error === 'object') {
			const nested = anyErr.error;
			if (typeof nested.message === 'string' && nested.message) {
				message = nested.message;
			}
		}
		return { status: status >= 400 && status < 600 ? status : 500, message };
	}
	return { status: 500, message: err instanceof Error ? err.message : 'Generation failed' };
}

const corsHeaders = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Methods': 'POST, OPTIONS',
	'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
	return new NextResponse(null, { status: 204, headers: corsHeaders });
}

export async function POST(request) {
	let body = {};
	try {
		body = await request.json();
	} catch {
		body = {};
	}

	const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
	const history = normalizeHistory(body.messages);

	if (!prompt) {
		return NextResponse.json(
			{ error: 'Missing or empty prompt', code: 'MISSING_PROMPT' },
			{ status: 400, headers: corsHeaders }
		);
	}

	if (!process.env.ANTHROPIC_API_KEY) {
		return NextResponse.json(
			{ error: 'ANTHROPIC_API_KEY is not set', code: 'MISSING_API_KEY' },
			{ status: 500, headers: corsHeaders }
		);
	}

	if (history.length % 2 !== 0) {
		return NextResponse.json(
			{
				error: 'Conversation history must be complete user/assistant pairs',
				code: 'INVALID_THREAD',
			},
			{ status: 400, headers: corsHeaders }
		);
	}

	for (let i = 0; i < history.length; i += 1) {
		const expected = i % 2 === 0 ? 'user' : 'assistant';
		if (history[i].role !== expected) {
			return NextResponse.json(
				{
					error: 'Conversation must alternate user and assistant messages',
					code: 'INVALID_THREAD',
				},
				{ status: 400, headers: corsHeaders }
			);
		}
	}

	const messages = [...history, { role: 'user', content: prompt }];
	const model = resolveModel(process.env.ANTHROPIC_MODEL);
	const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

	try {
		const message = await anthropic.messages.create({
			model,
			max_tokens: 8192,
			system: SYSTEM_PROMPT,
			messages,
		});

		const raw = message.content
			.filter((block) => block.type === 'text')
			.map((block) => block.text)
			.join('');
		const html = extractHtml(raw);

		if (!html || (!/<html[\s>]/i.test(html) && !/<!DOCTYPE\s+html/i.test(html))) {
			return NextResponse.json(
				{
					error:
						'Model did not return a complete HTML document. Try again or shorten the conversation.',
					code: 'INVALID_OUTPUT',
				},
				{ status: 502, headers: corsHeaders }
			);
		}

		return new NextResponse(html, {
			status: 200,
			headers: {
				...corsHeaders,
				'Content-Type': 'text/html; charset=utf-8',
			},
		});
	} catch (err) {
		const { status, message } = formatApiError(err);
		return NextResponse.json(
			{ error: message, code: 'ANTHROPIC_ERROR' },
			{ status, headers: corsHeaders }
		);
	}
}
