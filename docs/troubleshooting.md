# Troubleshooting Guide

## Problem: Clicking the extension icon does nothing

### 1. Check your Chrome version

```text
1. Open chrome://version/
2. Check the version number
3. Chrome 114 or later is required
```

If your browser is too old, upgrade Chrome first.

### 2. Confirm that the extension loaded correctly

```text
1. Open chrome://extensions/
2. Find "Page Copilot by Alon"
3. Check whether Chrome shows any red error messages
```

Common errors:

- `"Manifest file is missing or unreadable"`: the selected folder is wrong
- `"Manifest version 3 requires..."`: `manifest.json` is invalid
- `"Service worker registration failed"`: `background.js` has a syntax or runtime error

If Chrome shows an error, open the details and copy the exact message.

### 3. Check the console logs

```text
1. Open chrome://extensions/
2. Find "Page Copilot by Alon"
3. Click the service worker link (or the inspect view link)
4. Open DevTools
```

Expected logs:

```text
[Page Copilot] Background service worker started
[Page Copilot] Extension installed
```

If you do not see these logs, the background service worker is not running correctly.

### 4. Trigger the side panel manually

Method A: from the extension management page

```text
1. Right-click the extension icon
2. Open the extension management page
3. Try any available extension action from there
```

Method B: from the page context menu

```text
1. Select some text on any webpage
2. Right-click
3. Check whether actions such as "Translate Selected Text" appear
4. Click one of them and see whether the side panel opens
```

### 5. Reload the extension

```text
1. Open chrome://extensions/
2. Find "Page Copilot by Alon"
3. Click the reload button
4. Test the extension icon again
```

### 6. Check whether Chrome side panel support is enabled

Some Chrome builds expose side panel controls differently:

```text
1. Open the Chrome menu in the top-right corner
2. Look for "Side panel" or similar UI
3. Confirm that the side panel feature is available and enabled
```

## If the problem persists

### Include this information in your issue report

- Chrome version
- Whether `chrome://extensions/` shows any red error message
- Relevant service worker or side panel console logs
- Exact reproduction steps

Useful examples:

- Clicking the icon does nothing
- The context menu action is missing
- The side panel opens, but buttons inside it do nothing

## Quick smoke test

The fastest manual test is:

```text
1. Open any webpage
2. Select some text
3. Right-click
4. Check whether "Translate Selected Text" appears
```

If it appears, the extension is loaded and at least part of the content-script path is working.

## Reset the extension

If all else fails:

```text
1. Remove the extension from chrome://extensions/
2. Load the project directory again
3. Reconfigure the model API settings
```

## Feedback

- Use repository Issues for bug reports
- Use Discussions for questions, ideas, and open-ended feedback
