(function () {
  const STORAGE_CONVERSATION = 'formGen_conversation_v1';
  const STORAGE_PROMPTS = 'formGen_promptHistory_v1';
  const STORAGE_SOURCE_COLLAPSED = 'formGen_sourceCollapsed_v1';
  const MAX_PROMPT_HISTORY = 25;

  const promptInput = document.getElementById('prompt-input');
  const generateBtn = document.getElementById('generate-btn');
  const copyBtn = document.getElementById('copy-btn');
  const downloadBtn = document.getElementById('download-btn');
  const clearBtn = document.getElementById('clear-history-btn');
  const codeBlock = document.getElementById('code-block');
  const previewEl = document.getElementById('preview');
  const errEl = document.getElementById('err');
  const loaderEl = document.getElementById('loader');
  const toastEl = document.getElementById('toast');
  const promptHistoryEl = document.getElementById('prompt-history');
  const sourceSubpanel = document.getElementById('source-subpanel');
  const sourceToggle = document.getElementById('source-toggle');

  /** @type {{ role: string, content: string }[]} */
  let conversation = [];
  let lastHtml = '';

  function showToast(text, isError) {
    toastEl.textContent = text;
    toastEl.classList.toggle('toast--error', !!isError);
    toastEl.hidden = false;
    toastEl.setAttribute('aria-live', 'polite');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(function () {
      toastEl.hidden = true;
    }, 3200);
  }

  function setError(msg) {
    if (msg) {
      errEl.textContent = msg;
      errEl.hidden = false;
    } else {
      errEl.hidden = true;
      errEl.textContent = '';
    }
  }

  function setLoading(on) {
    loaderEl.hidden = !on;
    generateBtn.disabled = on;
    promptInput.disabled = on;
    document.body.classList.toggle('is-loading', on);
  }

  function applySourceCollapsed(collapsed) {
    if (!sourceSubpanel || !sourceToggle) return;
    sourceSubpanel.classList.toggle('is-collapsed', collapsed);
    sourceToggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    sourceToggle.textContent = collapsed ? 'Show source' : 'Hide source';
    try {
      sessionStorage.setItem(STORAGE_SOURCE_COLLAPSED, collapsed ? '1' : '0');
    } catch (e) {
      /* ignore */
    }
  }

  function restoreSourceCollapsed() {
    try {
      if (sessionStorage.getItem(STORAGE_SOURCE_COLLAPSED) === '1') {
        applySourceCollapsed(true);
      }
    } catch (e) {
      /* ignore */
    }
  }

  if (sourceToggle && sourceSubpanel) {
    sourceToggle.addEventListener('click', function () {
      var collapsed = !sourceSubpanel.classList.contains('is-collapsed');
      applySourceCollapsed(collapsed);
    });
  }

  restoreSourceCollapsed();

  function saveConversation() {
    try {
      localStorage.setItem(STORAGE_CONVERSATION, JSON.stringify(conversation));
    } catch (e) {
      showToast('Could not save conversation', true);
    }
  }

  function loadConversation() {
    try {
      const raw = localStorage.getItem(STORAGE_CONVERSATION);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        conversation = parsed.filter(function (m) {
          return m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string';
        });
      }
    } catch (e) {
      conversation = [];
    }
  }

  function savePromptToHistory(text) {
    if (!text) return;
    try {
      let list = [];
      const raw = localStorage.getItem(STORAGE_PROMPTS);
      if (raw) list = JSON.parse(raw);
      if (!Array.isArray(list)) list = [];
      list = list.filter(function (p) {
        return p !== text;
      });
      list.unshift(text);
      list = list.slice(0, MAX_PROMPT_HISTORY);
      localStorage.setItem(STORAGE_PROMPTS, JSON.stringify(list));
      renderPromptHistory();
    } catch (e) {
      /* ignore */
    }
  }

  function renderPromptHistory() {
    promptHistoryEl.innerHTML = '';
    try {
      const raw = localStorage.getItem(STORAGE_PROMPTS);
      const list = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(list) || list.length === 0) {
        var empty = document.createElement('p');
        empty.className = 'muted small';
        empty.textContent = 'No saved prompts yet.';
        promptHistoryEl.appendChild(empty);
        return;
      }
      list.forEach(function (p) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'chip';
        btn.textContent = p.length > 48 ? p.slice(0, 45) + '…' : p;
        btn.title = p;
        btn.addEventListener('click', function () {
          promptInput.value = p;
          promptInput.focus();
        });
        promptHistoryEl.appendChild(btn);
      });
    } catch (e) {
      promptHistoryEl.innerHTML = '';
    }
  }

  function highlightCode(htmlSource) {
    codeBlock.textContent = htmlSource;
    codeBlock.className = 'language-html';
    if (typeof Prism !== 'undefined') {
      Prism.highlightElement(codeBlock);
    }
  }

  function parseErrorResponse(res, textBody) {
    try {
      var j = JSON.parse(textBody);
      if (j && j.error) return j.error;
    } catch (e) {
      /* ignore */
    }
    if (res.status === 413) return 'Request too large. Try clearing history or shorter prompts.';
    if (res.status === 429) return 'Rate limited. Please wait and try again.';
    if (res.status >= 500) return 'Server error. Check API key and try again.';
    return textBody || 'Request failed (' + res.status + ')';
  }

  generateBtn.addEventListener('click', async function () {
    var prompt = promptInput.value.trim();
    if (!prompt) {
      setError('Enter a form requirement or follow-up instruction.');
      showToast('Add a prompt first', true);
      return;
    }

    setError('');
    setLoading(true);
    copyBtn.disabled = true;
    downloadBtn.disabled = true;

    try {
      var res = await fetch('/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: prompt,
          messages: conversation,
        }),
      });

      var ct = res.headers.get('content-type') || '';
      var bodyText = await res.text();

      if (!res.ok) {
        throw new Error(parseErrorResponse(res, bodyText));
      }

      if (!ct.includes('text/html')) {
        throw new Error(parseErrorResponse(res, bodyText));
      }

      lastHtml = bodyText;
      conversation.push({ role: 'user', content: prompt });
      conversation.push({ role: 'assistant', content: lastHtml });
      saveConversation();
      savePromptToHistory(prompt);

      promptInput.value = '';
      highlightCode(lastHtml);
      previewEl.srcdoc = lastHtml;
      copyBtn.disabled = false;
      downloadBtn.disabled = false;
      showToast('Form generated');
    } catch (e) {
      var msg = e && e.message ? e.message : 'Something went wrong';
      setError(msg);
      showToast(msg, true);
    } finally {
      setLoading(false);
    }
  });

  copyBtn.addEventListener('click', async function () {
    if (!lastHtml) return;
    try {
      await navigator.clipboard.writeText(lastHtml);
      showToast('Code copied');
    } catch (e) {
      showToast('Copy failed', true);
    }
  });

  downloadBtn.addEventListener('click', function () {
    if (!lastHtml) return;
    var blob = new Blob([lastHtml], { type: 'text/html;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'generated-form.html';
    a.click();
    URL.revokeObjectURL(url);
    showToast('Download started');
  });

  clearBtn.addEventListener('click', function () {
    conversation = [];
    lastHtml = '';
    saveConversation();
    codeBlock.textContent = '';
    codeBlock.className = 'language-html';
    previewEl.removeAttribute('srcdoc');
    copyBtn.disabled = true;
    downloadBtn.disabled = true;
    setError('');
    showToast('Conversation cleared');
  });

  loadConversation();
  renderPromptHistory();

  if (conversation.length > 0) {
    var lastAssistant = null;
    for (var i = conversation.length - 1; i >= 0; i--) {
      if (conversation[i].role === 'assistant') {
        lastAssistant = conversation[i].content;
        break;
      }
    }
    if (lastAssistant) {
      lastHtml = lastAssistant;
      highlightCode(lastHtml);
      previewEl.srcdoc = lastHtml;
      copyBtn.disabled = false;
      downloadBtn.disabled = false;
    }
  }
})();
