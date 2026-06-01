const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  console.log('\n=== FORM BUILDER UI VERIFICATION ===\n');

  // Navigate to the index page
  console.log('[1] Navigating to http://localhost:3000/index.html');
  await page.goto('http://localhost:3000/index.html', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  // Verify Edit Form tab is hidden
  console.log('[2] Checking Edit Form tab visibility...');
  const editTabHidden = await page.locator('#builder-tab-edit').evaluate(el => el.hidden);
  console.log(`   Edit Form tab hidden: ${editTabHidden ? '✓' : '✗'}`);

  // Verify Preview tab is visible and active
  console.log('[3] Checking Preview Form tab status...');
  const previewTabHidden = await page.locator('#builder-tab-preview').evaluate(el => el.hidden);
  const previewTabActive = await page.locator('#builder-tab-preview').evaluate(el => el.classList.contains('is-active'));
  console.log(`   Preview Form tab visible: ${!previewTabHidden ? '✓' : '✗'}`);
  console.log(`   Preview Form tab active: ${previewTabActive ? '✓' : '✗'}`);

  // Verify "Edit with AI" button exists and is visible
  console.log('[4] Checking "Edit with AI" button...');
  const editAiBtn = await page.locator('#edit-with-ai-btn');
  const btnVisible = await editAiBtn.isVisible();
  const btnText = btnVisible ? await editAiBtn.textContent() : 'N/A';
  console.log(`   Button visible: ${btnVisible ? '✓' : '✗'}`);
  console.log(`   Button text: "${btnText.trim()}"`);

  // Verify AI Modal exists but is hidden initially
  console.log('[5] Checking AI Edit Modal initial state...');
  const aiModal = await page.locator('#ai-edit-modal');
  const modalExists = await aiModal.count() > 0;
  const modalHidden = modalExists ? await aiModal.evaluate(el => el.hidden) : false;
  console.log(`   Modal exists: ${modalExists ? '✓' : '✗'}`);
  console.log(`   Modal hidden initially: ${modalHidden ? '✓' : '✗'}`);

  // Click the "Edit with AI" button
  console.log('[6] Clicking "Edit with AI" button...');
  if (btnVisible) {
    await editAiBtn.click();
    await page.waitForTimeout(500);

    const modalHiddenAfterClick = await aiModal.evaluate(el => el.hidden);
    console.log(`   Modal shown after click: ${!modalHiddenAfterClick ? '✓' : '✗'}`);

    // Verify modal content
    console.log('[7] Checking modal content...');
    const modalTitle = await page.locator('#ai-edit-modal-title').textContent();
    console.log(`   Modal title: "${modalTitle}"`);

    const aiInput = await page.locator('#editor-ai-input');
    const aiInputVisible = await aiInput.isVisible();
    console.log(`   AI input visible: ${aiInputVisible ? '✓' : '✗'}`);

    const updateBtn = await page.locator('#editor-ai-btn');
    const updateBtnVisible = await updateBtn.isVisible();
    const updateBtnText = updateBtnVisible ? await updateBtn.textContent() : 'N/A';
    console.log(`   Update button visible: ${updateBtnVisible ? '✓' : '✗'}`);
    console.log(`   Update button text: "${updateBtnText.trim()}"`);

    const closeBtn = await page.locator('#ai-edit-modal-close');
    const closeBtnVisible = await closeBtn.isVisible();
    console.log(`   Close button visible: ${closeBtnVisible ? '✓' : '✗'}`);

    // Test Escape key to close modal
    console.log('[8] Testing Escape key to close modal...');
    await page.press('body', 'Escape');
    await page.waitForTimeout(300);
    const modalHiddenAfterEscape = await aiModal.evaluate(el => el.hidden);
    console.log(`   Modal hidden after Escape: ${modalHiddenAfterEscape ? '✓' : '✗'}`);

    // Reopen modal and test close button
    console.log('[9] Testing close button...');
    await editAiBtn.click();
    await page.waitForTimeout(300);
    const closeBtnClickable = await closeBtn.isVisible();
    if (closeBtnClickable) {
      await closeBtn.click();
      await page.waitForTimeout(300);
      const modalHiddenAfterCloseBtn = await aiModal.evaluate(el => el.hidden);
      console.log(`   Modal hidden after close button: ${modalHiddenAfterCloseBtn ? '✓' : '✗'}`);
    }
  }

  console.log('\n=== VERIFICATION COMPLETE ===\n');
  await browser.close();
})().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
