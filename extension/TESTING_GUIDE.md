# Extension Testing Guide

## Quick Test Steps:

1. **Verify Server is Running**
   - Server should be at http://localhost:3000
   - Check terminal shows: "✅ MCQ AI Server started"

2. **Install/Reload Extension**
   - Open Chrome: `chrome://extensions/`
   - Enable "Developer mode" (top right)
   - Click "Load unpacked"
   - Select folder: `C:\Users\Administrator\Desktop\testing\extention 2`
   - OR if already loaded, click the refresh icon on the extension

3. **Test Extension**
   - Click the extension icon in Chrome toolbar
   - Set "Activation Mode" to "Manual"
   - Click "Start" button
   - Extension should capture screenshot and show notification

## Common Issues & Fixes:

### Issue 1: "Could not connect to server"
**Fix:** Make sure server is running on port 3000
```powershell
cd "c:/Users/Administrator/Desktop/testing/mcq-server"
node server.js
```

### Issue 2: No notification appears
**Fix:** 
1. Check Chrome notifications are enabled
2. Check console for errors: Right-click extension icon → "Inspect popup"

### Issue 3: Extension not capturing
**Fix:**
1. Reload the extension in chrome://extensions/
2. Refresh the webpage you're testing on
3. Check background console: chrome://extensions/ → "Inspect views: background.html"

### Issue 4: Server returns error 500
**Fix:** The MultiKeyManager might have no keys loaded.
- Go to http://localhost:3000
- Add an API key using the ➕ button in the "API Keys" section

## Testing the Full Flow:

1. Open any webpage with an MCQ question
2. Click extension icon
3. Choose "Manual" mode
4. Click "Start"
5. Should see notification: "Processing screenshot..."
6. Then: "MCQ Answer: A/B/C/D"

## Debugging:

Check these consoles for errors:
1. **Extension Background**: chrome://extensions/ → Details → "Inspect views: background page"
2. **Extension Popup**: Right-click extension icon → Inspect
3. **Server**: Check the terminal running node server.js
