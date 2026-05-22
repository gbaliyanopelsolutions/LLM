/**
 * Resize preview/public iframes to match document height (page scroll only, no inner scrollbar).
 */

/** @type {string} */
export const FRAME_HEIGHT_REPORT_SCRIPT = `
(function () {
  function reportHeight() {
    var doc = document.documentElement;
    var body = document.body;
    var h = Math.max(
      doc ? doc.scrollHeight : 0,
      body ? body.scrollHeight : 0,
      doc ? doc.offsetHeight : 0,
      body ? body.offsetHeight : 0
    );
    try {
      window.parent.postMessage({ type: 'preview-frame-height', height: h }, '*');
    } catch (e) { /* ignore */ }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', reportHeight);
  } else {
    reportHeight();
  }
  window.addEventListener('load', reportHeight);
  window.addEventListener('resize', reportHeight);
  if (typeof ResizeObserver !== 'undefined' && document.body) {
    new ResizeObserver(reportHeight).observe(document.body);
  }
  setTimeout(reportHeight, 100);
  setTimeout(reportHeight, 400);
})();
`;

/**
 * @param {string} html
 * @returns {string}
 */
export function injectFrameHeightReporter(html) {
	const raw = String(html || '').trim();
	if (!raw) {
		return raw;
	}
	if (raw.includes('preview-frame-height')) {
		return raw;
	}
	const script = `<script>${FRAME_HEIGHT_REPORT_SCRIPT}<\/script>`;
	if (/<\/body>/i.test(raw)) {
		return raw.replace(/<\/body>/i, `${script}</body>`);
	}
	return `${raw}${script}`;
}

/**
 * @param {HTMLIFrameElement} iframe
 * @param {{ minHeight?: number }} [options]
 */
export function attachAutoHeightIframe(iframe, options = {}) {
	const minH = options.minHeight ?? 120;

	/**
	 * @param {number} height
	 */
	function applyHeight(height) {
		const h = Math.max(minH, Math.ceil(height));
		iframe.style.height = `${h}px`;
		iframe.style.minHeight = '0';
		iframe.style.maxHeight = 'none';
		iframe.style.flex = 'none';
		iframe.style.overflow = 'visible';
	}

	function measureFromDocument() {
		try {
			const doc = iframe.contentDocument;
			if (!doc) {
				return;
			}
			const root = doc.documentElement;
			const body = doc.body;
			const h = Math.max(
				root?.scrollHeight ?? 0,
				body?.scrollHeight ?? 0,
				root?.offsetHeight ?? 0,
				body?.offsetHeight ?? 0
			);
			applyHeight(h);
		} catch {
			/* cross-origin or not ready */
		}
	}

	iframe.addEventListener('load', () => {
		measureFromDocument();
		try {
			const doc = iframe.contentDocument;
			if (doc?.body && typeof ResizeObserver !== 'undefined') {
				const ro = new ResizeObserver(() => measureFromDocument());
				ro.observe(doc.body);
				if (doc.documentElement) {
					ro.observe(doc.documentElement);
				}
			}
		} catch {
			/* ignore */
		}
	});

	window.addEventListener('message', (event) => {
		if (event.source !== iframe.contentWindow) {
			return;
		}
		const data = event.data;
		if (
			data &&
			typeof data === 'object' &&
			data.type === 'preview-frame-height' &&
			typeof data.height === 'number'
		) {
			applyHeight(data.height);
		}
	});
}
