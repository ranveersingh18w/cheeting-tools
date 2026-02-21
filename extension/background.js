// Listen for keyboard shortcuts
chrome.commands.onCommand.addListener(async (command) => {
    console.log(`Command received: ${command}`);
    if (command === 'capture_screenshot') {
        const result = await chrome.storage.local.get(['activationMode', 'captureMode']);
        if (result.activationMode === 'shortcut') {
            console.log("Shortcut activation recognized.");
            triggerCapture(result.captureMode || 'fullscreen');
        }
    }
});

// Listen for messages from popup or content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log(`📩 Message received:`, request);
    if (request.action === 'capture') {
        // Trigger capture flow asynchronously, but respond to the sender immediately
        // to prevent "message channel closed" errors due to long timeouts (user selection, upload, etc).
        triggerCapture(request.captureMode || 'fullscreen')
            .catch((err) => console.error("Capture process error:", err));

        sendResponse({ success: true, message: "Capture sequence initiated" });
        return false; // Respond synchronously (channel closes immediately after sendResponse)
    }
    // sendResponse({ success: false, error: "Unknown action" }); // Optional: handle unknown actions
    return false;
});

// Global variable to track the active polling interval
let currentPollInterval = null;

// === HELPER: CROP IMAGE ===
async function cropImage(dataUrl, area) {
    return new Promise((resolve) => {
        fetch(dataUrl)
            .then(res => res.blob())
            .then(blob => createImageBitmap(blob))
            .then(bitmap => {
                const scale = area.devicePixelRatio || 1;

                const x = area.left * scale;
                const y = area.top * scale;
                const w = area.width * scale;
                const h = area.height * scale;

                const canvas = new OffscreenCanvas(w, h);
                const ctx = canvas.getContext('2d');

                ctx.drawImage(bitmap, x, y, w, h, 0, 0, w, h);

                canvas.convertToBlob({ type: 'image/png' }).then(blob => {
                    const reader = new FileReader();
                    reader.onloadend = () => resolve(reader.result);
                    reader.readAsDataURL(blob);
                });
            })
            .catch(err => {
                console.error("Crop failed:", err);
                resolve(dataUrl); // Return original if fail
            });
    });
}

async function triggerCapture(mode) {
    console.log(`📸 Triggering capture in ${mode} mode...`);

    // STOP any existing polls immediately to prevent race conditions
    if (currentPollInterval) {
        console.warn("🛑 Stopping previous poll loop due to new capture.");
        clearInterval(currentPollInterval);
        currentPollInterval = null;
    }

    let tab = null;
    try {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        tab = tabs[0];
        if (!tab) {
            console.warn("❌ No active tab found.");
            throw new Error("No active tab found");
        }

        let dataUrl;
        if (mode === 'fullscreen') {
            dataUrl = await chrome.tabs.captureVisibleTab(null, { format: 'png' });
        } else {
            console.log("Snippet mode initiated - implementing as area selection");

            if (mode === 'snippet') {
                try {
                    // Send message to content script to start selection
                    const response = await chrome.tabs.sendMessage(tab.id, { action: 'startSelection' });

                    if (response && (response.left !== undefined)) {
                        // We got coordinates!
                        console.log("Got coords:", response);

                        // Capture full screen first
                        const rawDataUrl = await chrome.tabs.captureVisibleTab(null, { format: 'png' });

                        // CROP IT using the Coords
                        dataUrl = await cropImage(rawDataUrl, response);

                    } else if (response === null) {
                        // User cancelled or selection too small
                        console.log("Snippet selection cancelled by user.");
                        // FIX: Use tab.id because notifyTabId is not defined in this scope
                        // REMOVED: No notification on cancellation requested by user
                        // if (tab && tab.id) chrome.tabs.sendMessage(tab.id, { action: 'displayAnswer', answer: 'Selection Cancelled', styles: { color: 'orange' }, isFinal: false });
                        return; // ABORT CAPTURE
                    } else if (response && response.dataUrl) {
                        dataUrl = response.dataUrl;
                    } else {
                        // Fallback - Only valid if response was undefined/weird, but NOT explicit cancellation
                        console.warn("Snippet selection failed (no coords), falling back to fullscreen");
                        dataUrl = await chrome.tabs.captureVisibleTab(null, { format: 'png' });
                    }
                } catch (e) {
                    console.warn("Could not invoke snippet (content script error)", e);
                    // If content script is missing (e.g. chrome:// page), fallback is safer, 
                    // OR warn user. Content script won't run on restricted pages.
                    // FIX: Use tab.id
                    if (tab && tab.id) chrome.tabs.sendMessage(tab.id, { action: 'displayAnswer', answer: 'Cannot snippet this page', styles: { color: 'red' }, isFinal: false });
                    return;
                }
            } else {
                dataUrl = await chrome.tabs.captureVisibleTab(null, { format: 'png' });
            }
        }

        console.log(`✅ Screenshot captured. Size: ${dataUrl ? dataUrl.length : 0} chars.`);

        // Await the upload so we can report success/failure back to the trigger message
        await uploadImage(dataUrl);
        return true;

    } catch (err) {
        console.error('❌ Capture failed:', err);
        // Report error back to tab via messaging if possible
        if (tab && tab.id) {
            // ERROR: Send as FINAL so it shows even if auto-click is on
            chrome.tabs.sendMessage(tab.id, { action: 'displayAnswer', answer: 'Capture Error: ' + err.message, styles: { color: 'red' }, isFinal: true });
        }
        throw err; // Re-throw so onMessage catches it
    }
}

async function uploadImage(dataUrl) {
    console.log("📤 Preparing upload...");
    let notifyTabId = null;
    try {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tabs && tabs[0]) notifyTabId = tabs[0].id;

        // STATUS UPDATE - REMOVE for "Don't show extra text" request
        /*
        if (notifyTabId) chrome.tabs.sendMessage(notifyTabId, { action: 'displayAnswer', answer: '📤 Uploading...', styles: { color: '#3b82f6' }, isFinal: false }); // Blue
        */

        // Get Device ID (create if not exists)
        let { deviceId, fontColor, fontSize, autoClickEnabled } = await chrome.storage.local.get(['deviceId', 'fontColor', 'fontSize', 'autoClickEnabled']);
        if (!deviceId) {
            deviceId = 'user_' + Math.random().toString(36).substr(2, 9);
            await chrome.storage.local.set({ deviceId });
        }

        const res = await fetch(dataUrl);
        const blob = await res.blob();

        const formData = new FormData();
        // IMPORTANT: Append text fields BEFORE the file so multer populates req.body
        formData.append('deviceId', deviceId);
        const autoClickStr = autoClickEnabled ? 'true' : 'false';
        formData.append('autoClickEnabled', autoClickStr);
        console.log(`📤 Uploading with AutoClick=${autoClickStr}`);

        formData.append('image', blob, 'screenshot.png');

        // UPDATED for Vercel Production
        // Using the newly deployed URL
        const API_URL = 'https://cheatingtools.vercel.app';
        // const API_URL = 'http://127.0.0.1:3000';

        console.log(`🚀 Sending POST request to ${API_URL}/api/upload-image`);

        const response = await fetch(`${API_URL}/api/upload-image`, {
            method: 'POST',
            body: formData
        });

        // CHECK FOR VERCEL AUTH BLOCK
        if (response.status === 401 || response.status === 403) {
            console.error("❌ Vercel Deployment Protection Detected!");
            const msg = "Error: Vercel 'Deployment Protection' is ON. Please DISABLE it in Vercel Settings -> Deployment Protection.";
            if (notifyTabId) chrome.tabs.sendMessage(notifyTabId, { action: 'displayAnswer', answer: msg, styles: { color: 'red', fontSize: '16' }, isFinal: false });
            return;
        }

        // Validate Content-Type
        const contentType = response.headers.get("content-type");
        if (!contentType || !contentType.includes("application/json")) {
            const text = await response.text();
            console.error("❌ Received Access Denied or HTML response:", text.substring(0, 500));
            throw new Error(`Server returned non-JSON response (${response.status}). Check server status.`);
        }

        const data = await response.json();
        console.log("📥 Server Response:", data);

        if (data.success) {
            if (data.status === 'pending') {
                console.log(`⏳ Request pending approval (ReqID: ${data.requestId}). Starting poll...`);
                // STATUS UPDATE - REMOVE for "Don't show extra text" request
                /*
                if (notifyTabId) chrome.tabs.sendMessage(notifyTabId, { action: 'displayAnswer', answer: '⏳ Analyzed. Thinking...', styles: { color: '#fbbf24' }, isFinal: false }); // Yellow
                */
                pollForAnswer(data.requestId, fontColor, fontSize);
            } else if (data.status === 'completed') {
                console.log(`✅ Immediate Result: ${data.answer}`);
                displayAnswer(data.answer, fontColor, fontSize, true); // FINAL
            }
        } else {
            console.error('❌ Server returned error:', data);
            // Don't show server error to overlay
            if (notifyTabId) chrome.tabs.sendMessage(notifyTabId, { action: 'displayAnswer', answer: 'Server Error: ' + (data.error || 'Unknown'), styles: { color: 'red' }, isFinal: true });
        }

    } catch (err) {
        console.error('❌ Upload failed (Network/Server Error):', err);
        // Suppress on-screen error display as requested
        let errorMsg = 'Network/Upload Error: ' + err.message;
        if (err.message.includes('Failed to fetch')) {
            errorMsg = "Error: Server OFF or Blocked. Checks:\n1. Is 'server.js' running (Port 3000)?\n2. Allow '127.0.0.1' in AdBlock.";
        }
        if (notifyTabId) chrome.tabs.sendMessage(notifyTabId, { action: 'displayAnswer', answer: errorMsg, styles: { color: 'red', fontSize: '18px', fontWeight: 'bold' }, isFinal: true });

        throw err; // Propagate error for console logging
    }
}

async function pollForAnswer(requestId, fontColor, fontSize) {
    const MAX_ATTEMPTS = 60; // 2 minutes (2s insterval)
    let attempts = 0;

    // Clear any existing just in case (though triggerCapture handled it)
    if (currentPollInterval) clearInterval(currentPollInterval);

    currentPollInterval = setInterval(async () => {
        // CHECK IF TAB IS STILL ALIVE/LISTENING
        // If content script is dead/reloaded, we can't show answer.
        // We will try to get the active tab again just in case the user switched tabs 
        // (though arguably we should only notify the original tab, but focusing on user experience: just notify active)

        attempts++;
        try {
            // console.log(`🔄 Polling attempt ${attempts}/${MAX_ATTEMPTS} for ${requestId}...`);
            const API_URL = 'https://cheatingtools.vercel.app';
            // const API_URL = 'http://127.0.0.1:3000';
            const response = await fetch(`${API_URL}/api/status/${requestId}`);
            const data = await response.json();

            if (data.status === 'completed') {
                console.log(`✅ Poll Success! Answer received: ${data.answer}`);
                clearInterval(currentPollInterval);
                currentPollInterval = null;

                // IMPORTANT: Re-query the active tab because the original 'notifyTabId' might be stale 
                // or the user navigated. We want to show the answer on the CURRENT active tab if possible.
                // Or at least try to find a valid target.

                // Pass font info again just in case
                let { fontColor, fontSize } = await chrome.storage.local.get(['fontColor', 'fontSize']);

                displayAnswer(data.answer, fontColor, fontSize, true); // FINAL
            } else if (data.status === 'cancelled' || data.status === 'error') {
                console.warn(`🛑 Poll stopped. Status: ${data.status}`);
                clearInterval(currentPollInterval);
                currentPollInterval = null;
                // Suppress on-screen error
                displayAnswer("Error: " + data.status, 'red', 12, true); // FINAL because it's an error
            } else if (attempts >= MAX_ATTEMPTS) {
                console.error("⏰ Poll timeout.");
                clearInterval(currentPollInterval);
                currentPollInterval = null;
                // Suppress on-screen timeout
                displayAnswer("Timeout", 'red', 12, true); // FINAL
            }
        } catch (e) {
            console.error("❌ Polling network error:", e);
            // Don't stop polling on transient network errors immediately, unless it's persistent
            if (attempts > 5 && attempts % 5 === 0) {
                console.warn("⚠️ Repeated network errors...");
            }
            if (attempts >= MAX_ATTEMPTS) {
                clearInterval(currentPollInterval);
                // Suppress on-screen network error
                displayAnswer("Network Err", 'red', 12, true);
            }
        }
    }, 2000); // Check every 2 seconds
}

async function displayAnswer(answer, fontColor, fontSize, isFinal = false) {
    console.log(`📨 Sending answer to tab: ${answer} (Final: ${isFinal})`);

    let sentToTab = false;

    // 1. Try sending to Active Tab
    try {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tabs && tabs[0]) {
            await chrome.tabs.sendMessage(tabs[0].id, {
                action: 'displayAnswer',
                answer,
                styles: { color: fontColor, fontSize },
                isFinal
            });
            sentToTab = true;
            console.log("✅ Message sent to active tab.");
        } else {
            console.warn("⚠️ No active tab found to receive answer.");
        }
    } catch (err) {
        console.error("❌ Failed to send to tab:", err);
    }

    // 2. Backup: If Final Answer AND failed to send to tab (or just as extra safety?), use Notifications
    // Only for Final Answer or Error to reduce noise
    if (isFinal && !sentToTab) {
        // Strip styling chars if any
        const cleanAnswer = answer.replace('Error: ', '');

        chrome.notifications.create({
            type: 'basic',
            iconUrl: 'icons/icon128.png',
            title: 'MCQ Answer',
            message: cleanAnswer,
            priority: 2
        });
    }
}
