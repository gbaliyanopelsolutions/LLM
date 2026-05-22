'use strict';
const fs   = require('fs');
const path = require('path');

const REPLACEMENTS = [
	['href="/dashboard.html"',    'href="/dashboard"'],
	['href="/index.html"',        'href="/index"'],
	['href="/survey.html"',       'href="/survey"'],
	['href="/add-company.html"',  'href="/add-company"'],
	['href="/login.html"',        'href="/login"'],
	['href="/register.html"',     'href="/register"'],
	['href="/form.html"',         'href="/form"'],
	// JS window.location redirects
	["window.location.href = '/login.html'",     "window.location.href = '/login'"],
	["window.location.href = '/dashboard.html'", "window.location.href = '/dashboard'"],
	// action="" form targets
	['action="/login.html"',     'action="/login"'],
	['action="/register.html"',  'action="/register"'],
];

function processDir(dir) {
	fs.readdirSync(dir).forEach(f => {
		const fp = path.join(dir, f);
		const stat = fs.statSync(fp);
		if (stat.isDirectory()) { processDir(fp); return; }
		if (!f.endsWith('.html') && !f.endsWith('.js')) return;
		let content = fs.readFileSync(fp, 'utf8');
		let changed = false;
		REPLACEMENTS.forEach(([from, to]) => {
			if (content.includes(from)) {
				content = content.split(from).join(to);
				changed = true;
			}
		});
		if (changed) {
			fs.writeFileSync(fp, content, 'utf8');
			console.log('Updated:', path.relative(process.cwd(), fp));
		}
	});
}

processDir(path.join(__dirname, '..', 'public'));
console.log('All done.');
