'use strict';
const fs   = require('fs');
const path = require('path');

const files = [
	'public/dashboard.html',
	'public/index.html',
	'public/survey.html',
	'public/add-company.html',
];

const analyticsLink = [
	'        <a class="dash-nav-item" href="/analytics">',
	'          <svg class="dash-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">',
	'            <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>',
	'          </svg>',
	'          Analytics',
	'          <span class="dash-nav-badge">New</span>',
	'        </a>',
].join('\n');

// Some files use CRLF, some LF — try both
const MARKERS = [
	'          Companies\r\n        </a>',
	'          Companies\n        </a>',
];

files.forEach((rel) => {
	const file = path.join(__dirname, '..', rel);
	let html   = fs.readFileSync(file, 'utf8');

	if (html.includes('/analytics')) {
		console.log('Already has analytics:', rel);
		return;
	}

	const marker = MARKERS.find((m) => html.includes(m));
	if (!marker) {
		console.log('Marker not found:', rel);
		return;
	}

	const nl = marker.includes('\r\n') ? '\r\n' : '\n';
	html = html.replace(marker, marker + nl + analyticsLink);
	fs.writeFileSync(file, html, 'utf8');
	console.log('Updated:', rel);
});
