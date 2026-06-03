# Form Submission Debugging Guide

## Quick Checklist

Before testing, ensure:
- [ ] Survey is set to **"Active"** status (not Draft)
- [ ] Survey has at least one question
- [ ] You have filled in at least one form field before clicking Submit

## How to Debug Form Submission Issues

### Step 1: Open Browser Developer Tools
1. Open your form in a browser: `/form.html?survey=YOUR_SURVEY_ID`
2. Press `F12` or right-click → **Inspect** to open Developer Tools
3. Click the **Console** tab

### Step 2: Watch the Console Logs
When you load the form, you should see logs like:
```
[form.js] loaded survey, questions: 3 
[form.js] render mode: fallback
```

**What to check:**
- `questions: 0` → No questions loaded (check if survey was deleted or has no questions)
- `render mode: fallback` → Form rendered as plain HTML (normal)
- `render mode: iframe` → Form rendered as custom design (also normal)

### Step 3: Fill and Submit the Form
1. Fill in at least **ONE** form field (answer a question)
2. Click the **Submit Responses** button
3. Watch the console for logs

### Step 4: Check the Submission Logs
You should see logs like:
```
[form.js] form submit: questions count = 3
[form.js] form submit: collected answers count = 1 raw = {question-uuid: "your answer"}
[form.js] submitAnswers: rawAnswers = {question-uuid: "your answer"}
[form.js] submitAnswers: normalized answers = {question-uuid: "your answer"}
[form.js] submitAnswers: response = {ok: true, saved: 1, total_submissions: 1}
```

### Step 5: Understand the Logs

| Log | Meaning |
|-----|---------|
| `questions: 0` | ❌ No questions - check survey |
| `collected answers count = 0` | ❌ No form fields found or empty |
| `saved: 0` | ❌ Answers sent but not saved to database |
| `saved: 1` | ✅ Success! One response saved |
| `Please answer at least one question` | ⚠️ Toast message - you need to fill in a field |

### Step 6: Check Network Requests
1. Go to **Network** tab in Developer Tools
2. Reload the page
3. Look for requests to `/api/builder/surveys/...`
4. Check for `public` endpoint (should return 200 OK)
5. Fill the form and submit
6. Check for `submit` endpoint (should return 200 OK with saved responses)

### Common Issues and Solutions

#### Issue: "This survey is not available yet"
**Cause:** Survey status is set to "Draft"
**Fix:** 
1. Go back to form builder
2. Change **Survey status** from "Draft (default)" to "Active (public link works)"
3. Click **Save Form**
4. Try again

#### Issue: Form loads but shows no fields
**Cause:** Survey has no questions or questions failed to load
**Fix:**
1. Check console logs: `questions: 0`
2. Go back to form builder
3. Verify survey has questions added
4. Click **Save Form**
5. Try again

#### Issue: "Please answer at least one question"
**Cause:** No form fields were filled in or form didn't collect any data
**Fix:**
1. Make sure you're entering text/selecting options before submitting
2. Check console: `collected answers count = 0`
3. If count is 0, the form fields aren't being found correctly
4. Try refreshing the page and filling the form again

#### Issue: Console shows `saved: 0` despite filling the form
**Cause:** Answers were sent to the server but not recorded in the database
**Fix:**
1. Check server logs for database errors
2. Verify survey has the correct questions in the database
3. Reload the page and try again

### What to Provide When Reporting Issues

When reporting form submission issues, please provide:
1. **Survey ID** (from the URL: `/form.html?survey=THIS_ID`)
2. **Browser console logs** (copy the [form.js] logs)
3. **Network tab screenshot** showing the `submit` request and response
4. **Survey status** (Draft, Active, or Closed)
5. **Number of questions** in the survey

### Example of Successful Submission

Here's what a successful form submission should look like:

```javascript
// Loading the form
[form.js] loaded survey, questions: 2 Array(2) [...]
[form.js] render mode: fallback

// Submitting with answers
[form.js] form submit: questions count = 2
[form.js] form submit: collected answers count = 2 raw = {
  "q-1a2b3c": "John Doe",
  "q-2d3e4f": "Yes"
}
[form.js] submitAnswers: rawAnswers = {...}
[form.js] submitAnswers: normalized answers = {...}
[form.js] submitAnswers: response = {ok: true, saved: 2, total_submissions: 1}
// Toast: "Thank you — your responses were saved."
```

### Disabled Submit Button
If the **Submit Responses** button is disabled/grayed out:
1. It may be loading (show spinner)
2. Check if there are validation errors in the form
3. Wait for the form to fully load
4. Refresh if stuck

## Still Having Issues?

1. Take a screenshot of the console logs
2. Open the **Network** tab and check the API responses
3. Verify survey status is "Active" not "Draft"
4. Check if the survey has questions
5. Share the logs when reporting the issue
