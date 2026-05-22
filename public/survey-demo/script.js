'use strict';

// ── State ──────────────────────────────
const TOTAL_STEPS = 7;
let currentStep = 0; // 0 = intro page

const stepLabel    = document.getElementById('stepLabel');
const btnNext      = document.getElementById('btnNext');
const btnBack      = document.getElementById('btnBack');
const btnStart     = document.getElementById('btnStart');
const success      = document.getElementById('successScreen');
const progressWrap = document.getElementById('progressWrap');
const progressFill = document.getElementById('progressFill');
const progressCount = document.getElementById('progressCount');

// Arrow SVG for Next button
const ARROW_SVG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>`;

// ── Show / hide step ──────────────────
function showStep(n) {
  // Show/hide intro (step 0)
  const intro = document.getElementById('step-0');
  if (intro) intro.hidden = (n !== 0);

  // Show/hide question steps 1-7
  for (let i = 1; i <= TOTAL_STEPS; i++) {
    const el = document.getElementById('step-' + i);
    if (el) el.hidden = (i !== n);
  }

  // Progress bar
  if (progressWrap) progressWrap.hidden = (n === 0);
  if (n > 0 && progressFill) {
    progressFill.style.width = Math.round((n / TOTAL_STEPS) * 100) + '%';
  }
  if (n > 0 && progressCount) {
    progressCount.textContent = n + ' of ' + TOTAL_STEPS;
  }

  // Step label (sr-only)
  stepLabel.hidden = (n === 0);
  if (n > 0) stepLabel.textContent = 'Step ' + n + ' of ' + TOTAL_STEPS;

  // Nav row: hidden on intro page
  const navRow = document.querySelector('.nav-row');
  if (navRow) navRow.hidden = (n === 0);

  btnBack.hidden = (n <= 1);

  if (n === TOTAL_STEPS) {
    btnNext.innerHTML = 'Submit ' + ARROW_SVG;
  } else {
    btnNext.innerHTML = 'Next ' + ARROW_SVG;
  }

  // Scroll card back to top on step change
  const card = document.getElementById('surveyCard');
  if (card) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ── Start Survey button (intro → step 1) ──
if (btnStart) {
  btnStart.addEventListener('click', () => {
    currentStep = 1;
    showStep(1);
  });
}

// ── Validation per step ───────────────
function validateStep(n) {
  clearErrors();

  if (n === 1) {
    if (!document.querySelector('input[name="q1"]:checked')) {
      showErr('err-1'); return false;
    }
  }
  if (n === 2) {
    if (!document.querySelector('input[name="q2"]:checked')) {
      showErr('err-2'); return false;
    }
  }
  if (n === 3) {
    if (!document.querySelector('input[name="q3"]:checked')) {
      showErr('err-3'); return false;
    }
  }
  if (n === 4) {
    if (!document.querySelector('input[name="q4"]:checked')) {
      showErr('err-4'); return false;
    }
  }
  if (n === 5) {
    if (!document.querySelector('input[name="q5"]:checked')) {
      showErr('err-5'); return false;
    }
  }
  if (n === 6) {
    let ok = true;
    if (!document.getElementById('val-q6').value) { showErr('err-6a'); ok = false; }
    if (!document.getElementById('val-q7').value) { showErr('err-6b'); ok = false; }
    if (!document.getElementById('val-q8').value) { showErr('err-6c'); ok = false; }
    if (!ok) return false;
  }
  if (n === 7) {
    if (!document.querySelector('input[name="q10"]:checked')) {
      showErr('err-7'); return false;
    }
  }

  return true;
}

function showErr(id) {
  const el = document.getElementById(id);
  if (el) el.hidden = false;
}

function clearErrors() {
  document.querySelectorAll('.err-msg').forEach(e => { e.hidden = true; });
}

// ── Next button ───────────────────────
btnNext.addEventListener('click', () => {
  if (!validateStep(currentStep)) return;

  if (currentStep === TOTAL_STEPS) {
    // Submit
    success.hidden = false;
    return;
  }

  currentStep++;
  showStep(currentStep);
});

// ── Back button ───────────────────────
btnBack.addEventListener('click', () => {
  if (currentStep > 1) {
    clearErrors();
    currentStep--;
    showStep(currentStep);
  }
  // No back on step 1 (Back is hidden there)
});

// ── Scale buttons (0–10) ─────────────
document.querySelectorAll('.scale-row').forEach(row => {
  const btns   = row.querySelectorAll('.sc');
  const qName  = row.getAttribute('data-q');
  const hidden = document.getElementById('val-' + qName);

  btns.forEach(btn => {
    btn.addEventListener('click', () => {
      btns.forEach(b => b.classList.remove('on'));
      btn.classList.add('on');
      if (hidden) hidden.value = btn.getAttribute('data-v');
    });
  });
});

// ── Auto-advance on radio select ─────
// When user picks a radio option on steps 1–5, show a brief highlight
// then auto-advance after a short delay (like Typeform / Claude.ai UX)
const AUTO_ADVANCE_STEPS = [1, 2, 3, 4, 5];

document.querySelectorAll('.opt-list input[type="radio"]').forEach(inp => {
  inp.addEventListener('change', () => {
    // Find which step this radio belongs to
    const step = inp.closest('.step');
    if (!step) return;
    const stepNum = parseInt(step.id.replace('step-', ''), 10);

    if (AUTO_ADVANCE_STEPS.includes(stepNum) && stepNum === currentStep) {
      // Validate and advance after 350ms so user sees selection
      setTimeout(() => {
        if (validateStep(currentStep)) {
          clearErrors();
          if (currentStep < TOTAL_STEPS) {
            currentStep++;
            showStep(currentStep);
          }
        }
      }, 350);
    }
  });
});

// ── Init ─────────────────────────────
showStep(0); // start on intro page
// Set initial next button label
btnNext.innerHTML = 'Next ' + ARROW_SVG;
