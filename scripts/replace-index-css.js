'use strict';
const fs   = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'public', 'index.html');
let html = fs.readFileSync(filePath, 'utf8');

const newStyle = `  <style>
    /* ═══════════════════════════════════════════════
       Survey Form Builder — Form Builder — Modern AI-style 720px
       ═══════════════════════════════════════════════ */
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

    :root {
      --accent:        #6366f1;
      --accent-2:      #8b5cf6;
      --accent-soft:   rgba(99,102,241,0.09);
      --accent-glow:   rgba(99,102,241,0.22);
      --bg:            #f5f7ff;
      --bg-card:       #ffffff;
      --bg-soft:       #f8fafc;
      --border:        #e5e7eb;
      --border-focus:  rgba(99,102,241,0.55);
      --text:          #111827;
      --text-2:        #374151;
      --muted:         #6b7280;
      --hint:          #9ca3af;
      --danger:        #ef4444;
      --success:       #10b981;
      --radius:        20px;
      --radius-sm:     14px;
      --radius-xs:     10px;
      --shadow-sm:     0 1px 3px rgba(0,0,0,0.05), 0 4px 16px rgba(99,102,241,0.07);
      --shadow:        0 4px 6px rgba(0,0,0,0.04), 0 10px 40px rgba(99,102,241,0.10);
      --shadow-lg:     0 8px 12px rgba(0,0,0,0.05), 0 20px 60px rgba(99,102,241,0.13);
      --font:          'Inter', 'Segoe UI', system-ui, -apple-system, sans-serif;
      --tx:            0.2s ease;
      --tx-spring:     0.22s cubic-bezier(0.34,1.1,0.64,1);
    }

    *, *::before, *::after { box-sizing: border-box; }

    html, body {
      margin: 0; min-height: 100%;
      font-family: var(--font);
      color: var(--text);
      -webkit-font-smoothing: antialiased;
    }

    /* .app sits inside dash-page — center content at 720px */
    .app {
      max-width: 720px !important;
      margin: 0 auto !important;
      padding: 0 0 2.5rem !important;
      width: 100% !important;
    }

    /* ── Error banner ── */
    .alert { padding: 0.75rem 1rem; border-radius: var(--radius-xs); font-size: 0.875rem; margin-bottom: 1rem; }
    .alert--error { background: rgba(239,68,68,0.08); border: 1px solid rgba(239,68,68,0.25); color: #b91c1c; }
    [hidden] { display: none !important; }

    /* ══════════════════════════════════
       LAYOUT — single column
    ══════════════════════════════════ */
    .layout {
      display: flex;
      flex-direction: column;
      gap: 1.25rem;
    }

    /* ══════════════════════════════════
       PANEL — white card
    ══════════════════════════════════ */
    .panel {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      box-shadow: var(--shadow);
      overflow: hidden;
      animation: fbFadeUp 0.45s var(--tx-spring) both;
    }

    .panel__head {
      padding: 0.85rem 1.25rem;
      font-size: 0.7rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: var(--muted);
      border-bottom: 1px solid var(--border);
      background: var(--bg-soft);
    }

    .panel__subhead {
      padding: 1rem 1.25rem 0.45rem;
      font-size: 0.75rem;
      font-weight: 700;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--muted);
    }

    /* ══════════════════════════════════
       UPLOAD ZONE
    ══════════════════════════════════ */
    .doc-upload-field { padding: 1.1rem 1.25rem 0; }

    label.field-label, .field-label {
      display: block;
      font-size: 0.78rem;
      font-weight: 600;
      color: var(--text-2);
      margin-bottom: 0.5rem;
    }

    .doc-upload-zone {
      padding: 1.5rem 1.25rem;
      border: 2px dashed rgba(99,102,241,0.3);
      border-radius: var(--radius-sm);
      background: var(--accent-soft);
      text-align: center;
      cursor: pointer;
      transition: border-color var(--tx), background var(--tx), box-shadow var(--tx), transform 0.15s ease;
    }

    .doc-upload-zone:hover,
    .doc-upload-zone:focus-visible {
      border-color: var(--accent);
      background: rgba(99,102,241,0.13);
      box-shadow: 0 0 0 4px var(--accent-soft);
      transform: translateY(-1px);
      outline: none;
    }

    .doc-upload-zone.is-dragover {
      border-color: var(--accent);
      background: rgba(99,102,241,0.16);
      transform: scale(1.01);
    }

    .doc-upload-zone__title {
      margin: 0 0 0.3rem;
      font-size: 0.9rem;
      font-weight: 600;
      color: var(--text);
    }

    .doc-upload-zone__hint {
      margin: 0 0 0.25rem;
      font-size: 0.82rem;
      color: var(--accent);
      font-weight: 500;
    }

    .doc-upload-zone__types {
      font-size: 0.73rem;
      color: var(--hint);
    }

    .doc-upload-file-input { display: none; }

    .doc-upload-status {
      font-size: 0.78rem;
      color: var(--muted);
      margin: 0.4rem 0 0;
      min-height: 1.2em;
    }

    .doc-upload-chip {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      margin-top: 0.6rem;
      padding: 0.4rem 0.75rem;
      border-radius: 999px;
      background: var(--accent-soft);
      border: 1px solid rgba(99,102,241,0.25);
      font-size: 0.8rem;
    }

    .doc-upload-chip__name { font-weight: 600; color: var(--accent); }
    .doc-upload-chip__meta { color: var(--muted); }
    .doc-upload-chip__remove {
      appearance: none; border: none; background: none;
      cursor: pointer; color: var(--muted); font-size: 1rem; padding: 0 2px;
      line-height: 1;
      transition: color var(--tx);
    }
    .doc-upload-chip__remove:hover { color: var(--danger); }

    /* ══════════════════════════════════
       OR DIVIDER
    ══════════════════════════════════ */
    .prompt-or-divider {
      display: flex; align-items: center; gap: 0.75rem;
      margin: 1rem 1.25rem;
      font-size: 0.72rem; font-weight: 700; text-transform: uppercase;
      letter-spacing: 0.1em; color: var(--hint);
    }
    .prompt-or-divider::before,
    .prompt-or-divider::after {
      content: ''; flex: 1; height: 1px; background: var(--border);
    }

    /* ══════════════════════════════════
       FIELD / TEXTAREA / INPUT
    ══════════════════════════════════ */
    .field { padding: 0 1.25rem; }

    textarea,
    .input-control {
      width: 100%;
      padding: 0.85rem 1rem;
      border-radius: var(--radius-xs);
      border: 1.5px solid var(--border);
      background: #fafafa;
      color: var(--text);
      font-size: 0.9375rem;
      font-family: var(--font);
      line-height: 1.6;
      resize: vertical;
      transition: border-color var(--tx), box-shadow var(--tx), background var(--tx);
    }

    textarea:focus, .input-control:focus {
      outline: none;
      border-color: var(--border-focus);
      background: #fff;
      box-shadow: 0 0 0 4px var(--accent-soft);
    }

    textarea::placeholder, .input-control::placeholder { color: var(--hint); }

    select.input-control, select {
      cursor: pointer;
      padding-right: 2rem;
    }

    #prompt-input {
      min-height: 120px;
      font-size: 0.9375rem;
    }

    /* ══════════════════════════════════
       BUTTONS
    ══════════════════════════════════ */
    .btn {
      appearance: none; border: none; border-radius: var(--radius-xs);
      padding: 0.65rem 1.3rem; font-size: 0.9rem; font-weight: 600;
      cursor: pointer; font-family: var(--font);
      transition: all var(--tx);
      display: inline-flex; align-items: center; gap: 0.45rem;
      text-decoration: none;
    }
    .btn:active:not(:disabled) { transform: scale(0.97); }
    .btn:disabled { opacity: 0.45; cursor: not-allowed; }

    .btn--primary {
      background: linear-gradient(135deg, var(--accent), var(--accent-2));
      color: #fff;
      box-shadow: 0 4px 14px var(--accent-glow);
    }
    .btn--primary:hover:not(:disabled) {
      box-shadow: 0 6px 20px var(--accent-glow);
      opacity: 0.92;
    }

    .btn--ghost {
      background: var(--bg-card); color: var(--text-2);
      border: 1.5px solid var(--border);
    }
    .btn--ghost:hover:not(:disabled) { background: var(--bg-soft); border-color: #d1d5db; }

    .btn--small { padding: 0.45rem 0.9rem; font-size: 0.8rem; }
    .btn--danger-ghost { color: var(--danger); border-color: rgba(239,68,68,0.3); }
    .btn--danger-ghost:hover { background: rgba(239,68,68,0.07); }

    .actions {
      display: flex; flex-wrap: wrap; align-items: center; gap: 0.6rem;
      padding: 1rem 1.25rem;
    }

    /* ══════════════════════════════════
       CHIPS (Saved prompts)
    ══════════════════════════════════ */
    .chips {
      display: flex; flex-wrap: wrap; gap: 0.45rem;
      padding: 0 1.25rem 1.1rem;
      max-height: 84px; overflow: hidden;
    }

    .chip {
      padding: 0.32rem 0.75rem;
      border-radius: 999px;
      font-size: 0.78rem; font-weight: 500;
      background: var(--bg-soft); border: 1.5px solid var(--border);
      color: var(--text-2); cursor: pointer;
      transition: background var(--tx), border-color var(--tx), color var(--tx), transform 0.1s;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 22ch;
    }
    .chip:hover { background: var(--accent-soft); border-color: var(--accent); color: var(--accent); transform: translateY(-1px); }

    /* ══════════════════════════════════
       TABS (Edit / Preview)
    ══════════════════════════════════ */
    .builder-tabs {
      display: flex;
      background: var(--bg-soft);
      border-bottom: 1px solid var(--border);
      padding: 0 1.25rem;
      gap: 0;
    }

    .builder-tab {
      appearance: none; border: none; background: none;
      padding: 0.85rem 1.1rem;
      font-size: 0.875rem; font-weight: 600;
      color: var(--muted); cursor: pointer;
      font-family: var(--font);
      border-bottom: 2.5px solid transparent;
      margin-bottom: -1px;
      transition: color var(--tx), border-color var(--tx);
    }
    .builder-tab:hover { color: var(--text); }
    .builder-tab.is-active {
      color: var(--accent);
      border-bottom-color: var(--accent);
    }

    /* ══════════════════════════════════
       SPLIT (preview + source)
    ══════════════════════════════════ */
    .split { display: flex; flex-direction: column; }

    .subpanel--preview { flex: 1; display: flex; flex-direction: column; }

    /* ══════════════════════════════════
       BUILDER PANE — EDIT
    ══════════════════════════════════ */
    .builder-pane { padding: 1.25rem; }
    .builder-pane--edit { display: flex; flex-direction: column; gap: 1.1rem; }

    .editor-header {
      display: flex; align-items: center; justify-content: space-between; gap: 0.75rem;
      flex-wrap: wrap;
    }

    .editor-header__title { font-weight: 700; font-size: 0.9rem; margin: 0 0 0.2rem; }
    .editor-header__hint  { font-size: 0.77rem; color: var(--muted); margin: 0; }

    /* Editor question cards */
    .editor-cards { display: flex; flex-direction: column; gap: 0.65rem; }

    .editor-card {
      background: var(--bg-soft);
      border: 1.5px solid var(--border);
      border-radius: var(--radius-sm);
      padding: 0.85rem 1rem;
      display: flex; align-items: flex-start; gap: 0.75rem;
      cursor: default;
      transition: border-color var(--tx), box-shadow var(--tx), transform 0.15s ease;
    }
    .editor-card:hover { border-color: #d1d5db; box-shadow: var(--shadow-sm); transform: translateY(-1px); }
    .editor-card.is-dragging { opacity: 0.6; box-shadow: var(--shadow-lg); }

    .editor-card__drag {
      color: var(--hint); cursor: grab; flex-shrink: 0;
      padding-top: 2px;
      transition: color var(--tx);
    }
    .editor-card__drag:hover { color: var(--accent); }

    .editor-card__body { flex: 1; min-width: 0; }
    .editor-card__text { font-size: 0.875rem; font-weight: 600; color: var(--text); word-break: break-word; margin: 0 0 0.2rem; }
    .editor-card__meta { font-size: 0.73rem; color: var(--muted); display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }

    .editor-card__type-pill {
      display: inline-block; padding: 0.1rem 0.55rem;
      border-radius: 999px; font-size: 0.68rem; font-weight: 700;
      background: var(--accent-soft); color: var(--accent);
    }

    .editor-card__actions {
      display: flex; gap: 0.3rem; flex-shrink: 0;
      flex-wrap: wrap; justify-content: flex-end;
    }

    .editor-card__actions .btn { padding: 0.3rem 0.6rem; font-size: 0.72rem; }

    /* AI edit panel */
    .editor-ai {
      border: 1.5px solid var(--border);
      border-radius: var(--radius-sm);
      padding: 1rem;
      background: linear-gradient(135deg, rgba(99,102,241,0.04), rgba(139,92,246,0.04));
    }

    .editor-ai__title {
      font-size: 0.875rem; font-weight: 700; color: var(--text);
      margin: 0 0 0.3rem;
      display: flex; align-items: center; gap: 0.45rem;
    }

    .editor-ai__title::before {
      content: '✦';
      color: var(--accent); font-size: 0.85rem;
    }

    .editor-ai__hint {
      font-size: 0.78rem; color: var(--muted); margin: 0 0 0.75rem;
      line-height: 1.55;
    }

    .editor-ai__hint em { color: var(--accent); font-style: normal; font-weight: 500; }

    .editor-ai__textarea {
      width: 100%; padding: 0.75rem 0.9rem;
      border: 1.5px solid var(--border); border-radius: var(--radius-xs);
      font-family: var(--font); font-size: 0.875rem; resize: vertical;
      background: var(--bg-card); color: var(--text);
      transition: border-color var(--tx), box-shadow var(--tx);
      margin-bottom: 0.75rem;
    }
    .editor-ai__textarea:focus {
      outline: none; border-color: var(--border-focus);
      box-shadow: 0 0 0 3px var(--accent-soft);
    }
    .editor-ai__textarea::placeholder { color: var(--hint); }

    /* ══════════════════════════════════
       BUILDER PANE — PREVIEW
    ══════════════════════════════════ */
    #preview {
      width: 100%;
      border: none;
      min-height: 500px;
      border-radius: 0 0 var(--radius) var(--radius);
    }

    /* ══════════════════════════════════
       PREVIEW FOOTER (survey details)
    ══════════════════════════════════ */
    .preview-footer { border-top: 1px solid var(--border); }

    .survey-details { animation: fbFadeUp 0.35s var(--tx-spring) both; }

    .survey-details__body {
      display: flex; flex-direction: column; gap: 0.75rem;
      padding: 0.25rem 1.25rem 1.25rem;
    }

    .survey-details .field { padding: 0; }
    .survey-details .field-label { font-size: 0.78rem; color: var(--muted); margin-bottom: 0.35rem; }
    .survey-details .field-label span { color: var(--danger); }

    .btn-save-form {
      width: 100%; margin-top: 0.25rem;
      padding: 0.75rem; font-size: 0.9375rem;
      border-radius: var(--radius-sm);
      box-shadow: 0 6px 20px var(--accent-glow);
    }

    .survey-details__hint { font-size: 0.75rem; color: var(--hint); margin: 0 !important; }

    .preview-footer select {
      width: 100%;
      padding: 0.75rem 1rem;
      border-radius: var(--radius-xs);
      border: 1.5px solid var(--border);
      background: #fafafa;
      font-family: var(--font);
      font-size: 0.875rem;
      color: var(--text);
      cursor: pointer;
    }

    .preview-footer select:focus {
      outline: none; border-color: var(--border-focus);
      box-shadow: 0 0 0 3px var(--accent-soft);
    }

    /* ══════════════════════════════════
       SOURCE PANEL
    ══════════════════════════════════ */
    .subpanel--source { border-top: 1px solid var(--border); }

    .panel__head--split {
      display: flex; align-items: center; justify-content: space-between;
    }
    .panel__head-title { font-size: 0.7rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.09em; color: var(--muted); }

    .btn-source-toggle {
      appearance: none; border: 1.5px solid var(--border); border-radius: var(--radius-xs);
      background: var(--bg-card); color: var(--text-2);
      font-size: 0.78rem; font-weight: 600; font-family: var(--font);
      cursor: pointer; padding: 0.3rem 0.75rem;
      transition: background var(--tx), border-color var(--tx);
    }
    .btn-source-toggle:hover { background: var(--bg-soft); border-color: #d1d5db; }

    .source-panel__body { overflow: hidden; }
    .subpanel--source.is-collapsed .source-panel__body { display: none; }

    .source-panel__inner { padding: 1rem 1.25rem; }

    .code-wrap {
      margin: 0 0 0.85rem;
      border-radius: var(--radius-xs);
      overflow: auto;
      max-height: 360px;
      font-size: 0.8rem;
      background: #1e1e2e;
      border: 1px solid #2d2d3f;
    }

    .toolbar {
      display: flex; gap: 0.5rem; flex-wrap: wrap;
    }

    /* ══════════════════════════════════
       LOADER
    ══════════════════════════════════ */
    .loader {
      position: fixed; inset: 0; z-index: 500;
      background: rgba(15,15,30,0.5);
      backdrop-filter: blur(4px);
      display: grid; place-items: center;
    }

    .loader__card {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 2rem 2.5rem;
      text-align: center;
      box-shadow: var(--shadow-lg);
      display: flex; flex-direction: column; align-items: center; gap: 1rem;
      animation: fbFadeUp 0.25s var(--tx-spring) both;
    }

    .spinner {
      width: 36px; height: 36px;
      border-radius: 50%;
      border: 3px solid var(--border);
      border-top-color: var(--accent);
      animation: fbSpin 0.8s linear infinite;
    }

    .loader__text {
      font-size: 0.9rem; font-weight: 600;
      color: var(--text-2); margin: 0;
    }

    /* ══════════════════════════════════
       TOAST
    ══════════════════════════════════ */
    .toast {
      position: fixed;
      bottom: 1.5rem; left: 50%;
      transform: translateX(-50%);
      z-index: 600;
      padding: 0.6rem 1.25rem;
      border-radius: 999px;
      font-size: 0.875rem; font-weight: 500;
      background: var(--bg-card);
      border: 1px solid var(--border);
      box-shadow: 0 8px 30px rgba(0,0,0,0.12);
      white-space: nowrap;
      animation: fbToastIn 0.3s var(--tx-spring) both;
    }

    .toast--success { color: var(--success); border-color: rgba(16,185,129,0.3); }
    .toast--error   { color: var(--danger);  border-color: rgba(239,68,68,0.3); }

    /* ══════════════════════════════════
       MODAL
    ══════════════════════════════════ */
    .modal-backdrop {
      position: fixed; inset: 0; z-index: 400;
      background: rgba(0,0,0,0.45);
      backdrop-filter: blur(4px);
      display: grid; place-items: center;
      padding: 1rem;
    }
    .modal-backdrop[hidden] { display: none !important; }

    .modal-card {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 1.75rem;
      width: min(100%, 520px);
      box-shadow: var(--shadow-lg);
      animation: fbFadeUp 0.25s var(--tx-spring) both;
      max-height: 88vh; overflow-y: auto;
    }

    .editor-modal-card { width: min(100%, 600px); }

    .modal-card h2 {
      margin: 0 0 0.35rem;
      font-size: 1.1rem; font-weight: 700; letter-spacing: -0.01em;
    }

    .editor-modal-field {
      display: flex; flex-direction: column; gap: 0.35rem;
      margin-bottom: 0.85rem;
    }

    .editor-modal-field label, .editor-modal-field > label {
      font-size: 0.78rem; font-weight: 600; color: var(--muted);
    }

    .editor-modal-grid {
      display: grid; grid-template-columns: 1fr 1fr; gap: 0.65rem;
      margin-bottom: 0.85rem;
    }

    .editor-modal-toggle {
      display: flex; flex-direction: row; align-items: center;
      gap: 0.6rem; margin-bottom: 0.85rem;
    }

    .editor-modal-section-title {
      font-size: 0.73rem; font-weight: 700; letter-spacing: 0.07em;
      text-transform: uppercase; color: var(--muted);
      margin: 0.25rem 0 0.6rem;
    }

    .editor-modal-options {
      display: flex; flex-direction: column; gap: 0.4rem;
      margin-bottom: 0.5rem;
    }

    .editor-modal-option-row {
      display: flex; gap: 0.4rem; align-items: center;
    }

    .editor-modal-options__add { align-self: flex-start; }

    .editor-modal-actions {
      display: flex; justify-content: flex-end; gap: 0.5rem;
      flex-wrap: wrap; margin-top: 1.1rem;
    }

    /* URL box (save modal) */
    .url-box {
      background: var(--bg-soft); border: 1.5px solid var(--border);
      border-radius: var(--radius-xs); padding: 0.5rem 0.85rem;
      margin: 0.5rem 0;
    }
    .url-box input {
      width: 100%; border: none; background: none; outline: none;
      font-family: ui-monospace, monospace; font-size: 0.82rem; color: var(--text);
    }

    /* Misc */
    .muted  { color: var(--muted); }
    .small  { font-size: 0.82rem; }
    .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0,0,0,0); }

    /* ══════════════════════════════════
       ANIMATIONS
    ══════════════════════════════════ */
    @keyframes fbFadeUp {
      from { opacity: 0; transform: translateY(10px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    @keyframes fbSpin { to { transform: rotate(360deg); } }
    @keyframes fbToastIn {
      from { opacity: 0; transform: translateX(-50%) translateY(12px); }
      to   { opacity: 1; transform: translateX(-50%) translateY(0); }
    }

    /* ══════════════════════════════════
       RESPONSIVE
    ══════════════════════════════════ */
    @media (max-width: 760px) {
      .app { padding: 0 0 2rem !important; }
      .panel__head, .panel__subhead, .field, .actions, .chips,
      .builder-tabs, .builder-pane, .source-panel__inner { padding-left: 1rem; padding-right: 1rem; }
      .editor-modal-grid { grid-template-columns: 1fr; }
    }

    @media (max-width: 480px) {
      .editor-card__actions { gap: 0.2rem; }
      .builder-tab { padding: 0.7rem 0.75rem; font-size: 0.82rem; }
    }
  </style>`;

// Find and replace the style block
const styleStart = html.indexOf('  <style>');
const styleEnd   = html.indexOf('  </style>') + '  </style>'.length;

if (styleStart === -1 || styleEnd <= styleStart) {
  console.error('Could not find style block!');
  process.exit(1);
}

const newHtml = html.slice(0, styleStart) + newStyle + html.slice(styleEnd);
fs.writeFileSync(filePath, newHtml, 'utf8');
console.log('CSS replaced successfully. New length:', newHtml.length);
