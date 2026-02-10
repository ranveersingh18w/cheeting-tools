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
        triggerCapture(request.captureMode || 'fullscreen')
            .then(() => sendResponse({ success: true, message: "Capture started" }))
            .catch((err) => sendResponse({ success: false, error: err.toString() }));
        return true; // Indicates we will respond asynchronously
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
            // Implement simple area selection using chrome.tabs.captureVisibleTab (or a library if available)
            // For now, let's just do fullscreen as fallback, but log it properly.
            // Ideally, you would inject a content script to handle area selection and then crop the image. 
            // Since we can't easily add a new library here without user interaction, 
            // we will stick to the existing behavior but ensure it works. 
            // User reported snippet tool is not working. The code below was:
            // console.log("Snippet mode initiated - implementing as fullscreen for prototype");
            // dataUrl = await chrome.tabs.captureVisibleTab(null, { format: 'png' });
            
            // Actually, to support snippet properly without a library involves:
            // 1. Inject content script to draw a selection box.
            // 2. Return coordinates relative to viewport.
            // 3. Capture visible tab.
            // 4. Crop image using canvas.
            
            // Let's try to inject the capture area logic if mode is 'snippet'
            if (mode === 'snippet') {
                 try {
                    // Send message to content script to start selection
                    const response = await chrome.tabs.sendMessage(tab.id, { action: 'startSelection' });
                    
                    if (response && (response.left !== undefined)) {
                         // We got coordinates!
                         // 1. Capture full screen
                         console.log("Got coords:", response);
                         const rawDataUrl = await chrome.tabs.captureVisibleTab(null, { format: 'png' });
                         
                         // 2. Crop it
                         dataUrl = await cropImage(rawDataUrl, response);
                    } else if (response && response.dataUrl) {
                        dataUrl = response.dataUrl;
                    } else {
                        // Fallback
                         console.warn("Snippet selection cancelled or failed [no coords], falling back to fullscreen");
                         dataUrl = await chrome.tabs.captureVisibleTab(null, { format: 'png' });
                    }
                 } catch (e) {
                     console.warn("Could not invoke snippet on content script, maybe not loaded?", e);
                     dataUrl = await chrome.tabs.captureVisibleTab(null, { format: 'png' });
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
            chrome.tabs.sendMessage(tab.id, { action: 'displayAnswer', answer: 'Error: ' + err.message, styles: { color: 'red' }, isFinal: false });
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

        // STATUS UPDATE
        if (notifyTabId) chrome.tabs.sendMessage(notifyTabId, { action: 'displayAnswer', answer: '📤 Uploading...', styles: { color: '#3b82f6' }, isFinal: false }); // Blue

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

        const API_URL = 'https://mcq-server-f3ypmat03-ranveers-projects-0cec94ed.vercel.app'; // Vercel Updated 
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
                // STATUS UPDATE
                if (notifyTabId) chrome.tabs.sendMessage(notifyTabId, { action: 'displayAnswer', answer: '⏳ Analyzed. Thinking...', styles: { color: '#fbbf24' }, isFinal: false }); // Yellow
                pollForAnswer(data.requestId, fontColor, fontSize);
            } else if (data.status === 'completed') {
                console.log(`✅ Immediate Result: ${data.answer}`);
                displayAnswer(data.answer, fontColor, fontSize, true); // FINAL
            }
        } else {
            console.error('❌ Server returned error:', data);
            if (notifyTabId) chrome.tabs.sendMessage(notifyTabId, { action: 'displayAnswer', answer: 'Server Error: ' + (data.error || 'Unknown'), styles: { color: 'red' }, isFinal: false });
        }

    } catch (err) {
        console.error('❌ Upload failed (Network/Server Error):', err);
        if (notifyTabId) chrome.tabs.sendMessage(notifyTabId, { action: 'displayAnswer', answer: 'Network/Upload Error: ' + err.message, styles: { color: 'red' }, isFinal: false });
        throw err; // Propagate error
    }
}

async function pollForAnswer(requestId, fontColor, fontSize) {
    const MAX_ATTEMPTS = 60; // 2 minutes (2s insterval)
    let attempts = 0;

    // Clear any existing just in case (though triggerCapture handled it)
    if (currentPollInterval) clearInterval(currentPollInterval);

    currentPollInterval = setInterval(async () => {
        attempts++;
        try {
            // console.log(`🔄 Polling attempt ${attempts}/${MAX_ATTEMPTS} for ${requestId}...`);
            const API_URL = 'https://mcq-server-f3ypmat03-ranveers-projects-0cec94ed.vercel.app';
            const response = await fetch(`${API_URL}/api/status/${requestId}`);
            const data = await response.json();

            if (data.status === 'completed') {
                console.log(`✅ Poll Success! Answer received: ${data.answer}`);
                clearInterval(currentPollInterval);
                currentPollInterval = null;
                displayAnswer(data.answer, fontColor, fontSize, true); // FINAL
            } else if (data.status === 'cancelled' || data.status === 'error') {
                console.warn(`🛑 Poll stopped. Status: ${data.status}`);
                clearInterval(currentPollInterval);
                currentPollInterval = null;
                displayAnswer("Error: " + data.status, 'red', 12, false);
            } else if (attempts >= MAX_ATTEMPTS) {
                console.error("⏰ Poll timeout.");
                clearInterval(currentPollInterval);
                currentPollInterval = null;
                displayAnswer("Timeout", 'red', 12, false);
            }
        } catch (e) {
            console.error("❌ Polling network error:", e);
            clearInterval(currentPollInterval);
            currentPollInterval = null;
        }
    }, 2000); // Check every 2 seconds
}

async function displayAnswer(answer, fontColor, fontSize, isFinal = false) {
    console.log(`📨 Sending answer to tab: ${answer} (Final: ${isFinal})`);
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.id) {
        chrome.tabs.sendMessage(tab.id, {
            action: 'displayAnswer',
            answer: answer || '?',
            isFinal: isFinal, // Pass the flag
            styles: {
                color: fontColor || '#000000',
                fontSize: fontSize || 12
            }
        }).catch((err) => {
            console.error("❌ Failed to send message to tab (content script might not be loaded):", err);
        });
    }
}
