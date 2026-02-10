// === CONFIGURATION ===
let tripleClickTimer = null;
let clickCount = 0;
let activationMode = 'tripleclick'; // default
let autoClickEnabled = false; // default

// Initialize settings
chrome.storage.local.get(['activationMode', 'autoClickEnabled'], (result) => {
    if (result.activationMode) activationMode = result.activationMode;
    if (result.autoClickEnabled !== undefined) autoClickEnabled = result.autoClickEnabled;
    console.log(`🔧 [CONFIG] Loaded: Activation=${activationMode}, AutoClick=${autoClickEnabled}`);
});

// === MESSAGE LISTENER ===
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'updateSettings') {
        if (request.activationMode) activationMode = request.activationMode;
        if (request.autoClickEnabled !== undefined) autoClickEnabled = request.autoClickEnabled;
        console.log(`🔧 [CONFIG] Updated: Activation=${activationMode}, AutoClick=${autoClickEnabled}`);
    } else if (request.action === 'startSelection') {
        // Snippet Selection Logic
        startSnippetSelection().then(selection => {
            sendResponse(selection);
        }).catch(err => {
            console.error("Snippet selection failed", err);
            sendResponse({ error: err.message });
        });
        return true; // async response
    } else if (request.action === 'displayAnswer') {
        const { answer, isFinal } = request;
        console.log(`📩 [MSG] Received 'displayAnswer': "${answer}" (Final: ${isFinal})`);

        // 1. Show Visual Overlay (Always show status updates if auto-click is OFF, or if it's an error)
        // If Auto-Click is ON, we usually hide overlay, BUT we should show status updates if they are NOT final?
        // Actually, user wants "Silent Click". So hide everything if AutoClick is ON, unless it's an error.

        if (!autoClickEnabled) {
            // UPDATED: Filter out "Uploading..." messages if user finds them annoying
            if (answer.includes("Uploading") || answer.includes("Thinking")) {
                console.log(`ℹ️ [SILENT] Status update suppressed: "${answer}"`);
            } else {
                showAnswerOverlay(answer, request.styles);
            }
        } else {
            // in auto-mode, maybe show small status? For now, fully silent as requested.
            console.log(`🤫 [SILENT] Overlay suppressed. Status: ${answer}`);
        }

        // 2. Execute AI Clicker (The Hand) - ONLY IF FINAL ANSWER
        if (autoClickEnabled && answer && isFinal === true) {
            console.log(`🤖 [AUTO] Final Answer received. Engaging 'The Hand'...`);
            // Slight delay to allow page to settle
            setTimeout(() => {
                const success = clickAnswer(answer);
                if (success) {
                    // showNotification("✅ Auto-Clicked"); 
                } else {
                    console.warn("Could not auto-click:", answer);
                }
            }, 300);
        } else if (autoClickEnabled && !isFinal) {
            console.log(`ℹ️ [AUTO] Ignoring intermediate status: "${answer}"`);
        } else {
            console.log(`ℹ️ [AUTO] Skipped. Enabled=${autoClickEnabled}, Final=${isFinal}`);
        }
    }
});

function showNotification(msg) {
    const n = document.createElement('div');
    Object.assign(n.style, {
        position: 'fixed', bottom: '20px', right: '20px',
        background: '#333', color: '#fff', padding: '10px 20px',
        borderRadius: '5px', zIndex: 999999, fontSize: '14px'
    });
    n.textContent = msg;
    document.body.appendChild(n);
    setTimeout(() => n.remove(), 3000);
}

// === SNIPPET SELECTION LOGIC ===
function startSnippetSelection() {
    return new Promise((resolve, reject) => {
        const overlay = document.createElement('div');
        Object.assign(overlay.style, {
            position: 'fixed', top: '0', left: '0', width: '100%', height: '100%',
            background: 'rgba(0,0,0,0.3)', cursor: 'crosshair', zIndex: '2147483647'
        });
        document.body.appendChild(overlay);

        let startX, startY;
        const box = document.createElement('div');
        Object.assign(box.style, {
            border: '2px dashed #fff', position: 'fixed', display: 'none'
        });
        overlay.appendChild(box);

        function onMouseDown(e) {
            startX = e.clientX;
            startY = e.clientY;
            box.style.left = startX + 'px';
            box.style.top = startY + 'px';
            box.style.display = 'block';
            overlay.addEventListener('mousemove', onMouseMove);
            overlay.addEventListener('mouseup', onMouseUp);
        }

        function onMouseMove(e) {
            const currentX = e.clientX;
            const currentY = e.clientY;
            const width = Math.abs(currentX - startX);
            const height = Math.abs(currentY - startY);
            box.style.width = width + 'px';
            box.style.height = height + 'px';
            box.style.left = Math.min(currentX, startX) + 'px';
            box.style.top = Math.min(currentY, startY) + 'px';
        }

        function onMouseUp(e) {
            overlay.removeEventListener('mousemove', onMouseMove);
            overlay.removeEventListener('mouseup', onMouseUp);
            overlay.remove();

            // Calculate coordinates
            const rect = box.getBoundingClientRect();
            if (rect.width < 5 || rect.height < 5) {
                reject(new Error("Selection too small"));
                return;
            }

            // We need to capture the screen via background script then crop it.
            // Since we can't capture directly here, we ask background to capture visible tab,
            // but we need to pass coordinates back? 
            // Wait, the background script calls US. 
            // So we can't return the dataUrl directly unless we capture it?
            // Content scripts can't use captureVisibleTab.
            
            // CORRECTION: The background script must capture the FULL tab, send it to us, 
            // we crop it, and send it back. OR we send coordinates to background and it crops.
            // Using Canvas in background is possible (OffscreenCanvas) or just basic Image processing.
            // EASIER: Send coordinates back to background script.
            
            // However, the current flow in background.js is: 
            // 1. Send 'startSelection' to content. 
            // 2. Await response (which expects dataUrl).
            
            // To fix this without major refactor:
            // We'll tell background to capture FULL screen, then return it to us?
            // No, Background has the `captureVisibleTab`. 
            
            // Let's Change the protocol slightly:
            // 1. Content script gets coordinates.
            // 2. Content script sends coordinates back to background.
            // 3. Background captures full tab.
            // 4. Background crops it (or just sends full image if cropping is too hard in current env).
            
            // FOR NOW, to fulfill the "snippet tool" request simply:
            // We will capture coordinates here.
            // But we need to return a DATA URL of the crop.
            // We can't generate the screenshot here. 
            
            // ALTERNATIVE: Use html2canvas? No, too heavy.
            
            // Let's modify the Background Script to handle the "Two Step" process.
            // Or use a workaround:
            // 1. Background captures full screenshot first? No, UI overlay would be in it.
            
            // Proper flow:
            // 1. Background asks for selection.
            // 2. User selects area (Content Script).
            // 3. Content overlays are removed.
            // 4. Content script waits a split second.
            // 5. Content script tells background "Ready, here are coords".
            // 6. Background captures full tab.
            // 7. Background crops image using the coords.
            
            // Since I cannot easily change the 'call/response' structure in one go without breaking `triggerCapture` flow:
            // I will return the COORDINATES to the background script in the response.
            // Then upgrade background script to handle coordinates.

             resolve({ 
                 left: rect.left, 
                 top: rect.top, 
                 width: rect.width, 
                 height: rect.height,
                 devicePixelRatio: window.devicePixelRatio
             });
        }
        
        overlay.addEventListener('mousedown', onMouseDown);
    });
}

// === THE HAND: AI CLICK LOGIC ===
// This function runs inside the browser page
function clickAnswer(targetText) {
    console.log(`%c 🤖 [THE HAND] Searching for target: "${targetText}"`, 'color: #00ffff; font-weight: bold;');

    if (!targetText) {
        console.error("❌ [THE HAND] No target text provided!");
        return false;
    }

    // 1. Clean the target text
    // UPDATED: Keep digits and dots for numeric answers (e.g. 19.17)
    const cleanFn = (t) => t.toString().toLowerCase().replace(/[^a-z0-9.]/g, '').trim();
    const cleanTarget = cleanFn(targetText);
    console.log(`🔍 [THE HAND] Cleaned target: "${cleanTarget}"`);

    // 2. Get all potential interactable elements
    const elements = document.querySelectorAll('button, div, span, label, input, a, p, li, td');
    console.log(`📋 [THE HAND] Scanned ${elements.length} potential elements on page.`);

    let bestElement = null;
    let found = false;

    // 3. Loop through elements to find the text match
    for (let i = 0; i < elements.length; i++) {
        const el = elements[i];

        // Skip invisible elements logic if desired, but text extraction usually handles it.
        const elText = (el.innerText || el.textContent || "").trim();
        if (!elText) continue;

        const cleanElText = cleanFn(elText);

        // CHECK A: Exact-ish Match
        if (cleanElText === cleanTarget) {
            console.log(`   ✅ [MATCH] Exact text match found on <${el.tagName}>: "${elText}"`);
            bestElement = el;
            found = true;
            break;
        }

        // CHECK B: The element contains the answer (Fallback)
        if (cleanElText.includes(cleanTarget) && cleanElText.length < 100) {
            // Only log this if we haven't found a best element yet
            if (!bestElement) {
                console.log(`   ⚠️ [PARTIAL] Partial match found on <${el.tagName}>: "${elText}"`);
                bestElement = el;
            }
        }
    }

    // 4. Click logic
    if (bestElement) {
        console.log(`🎯 [THE HAND] Locking on element:`, bestElement);

        // Scroll into view
        bestElement.scrollIntoView({ behavior: 'smooth', block: 'center' });

        console.log("⚡ [THE HAND] EXECUTE CLICK SEQUENCES...");

        // STRATEGY: Click EVERYTHING relevant.
        // 1. Click the CONTAINER/TEXT (User explicitly asked "click on the text")
        console.log("   👉 Clicking Text Element (Container)...");
        bestElement.click();

        // 2. Click the CHILD INPUT if it exists (Ensures checkbox/radio state changes)
        // Find nested input/button
        const childInput = bestElement.querySelector('input[type="checkbox"], input[type="radio"], input, button');

        if (childInput && childInput !== bestElement) {
            console.log("   👉 Found nested input, Clicking that too:", childInput);
            // We use a small timeout to let the first click register/bubble if needed
            setTimeout(() => childInput.click(), 50);
        }

        // 3. SPECIAL CASE: Label 'for' attribute
        if ((bestElement.tagName === 'LABEL') && (bestElement.getAttribute('for'))) {
            const forId = bestElement.getAttribute('for');
            const forInput = document.getElementById(forId);
            if (forInput) {
                console.log("   🔗 Also clicking linked 'for' input:", forInput);
                setTimeout(() => forInput.click(), 50);
            }
        }

        console.log("✅ [THE HAND] Click Action Completed.");
        return true;
    } else {
        console.error(`❌ [THE HAND] FAILED. Could not find text matches for: "${targetText}"`);
        return false;
    }
}

// === OVERLAY LOGIC ===
let isDragging = false;
let dragStartX, dragStartY;
let overlayLeft, overlayTop;

function showAnswerOverlay(answer, styles = {}) {
    // Remove if exists
    const existing = document.getElementById('mcq-answer-overlay');
    if (existing) existing.remove();

    chrome.storage.local.get(['overlayX', 'overlayY'], (result) => {
        let posX = result.overlayX !== undefined ? result.overlayX : 10;
        let posY = result.overlayY !== undefined ? result.overlayY : 10;

        const overlay = document.createElement('div');
        overlay.id = 'mcq-answer-overlay';
        overlay.textContent = answer;

        const defaultStyles = { color: 'black', fontSize: '12' };
        const finalStyles = { ...defaultStyles, ...styles };

        Object.assign(overlay.style, {
            position: 'fixed', top: posY + 'px', left: posX + 'px',
            color: finalStyles.color, fontSize: finalStyles.fontSize + 'px',
            fontWeight: 'bold', fontFamily: 'Arial, sans-serif',
            zIndex: '2147483647', cursor: 'move', userSelect: 'none',
            padding: '4px 8px',
            // UPDATED: Removed background color
            // backgroundColor: 'rgba(0,0,0,0.8)',
            // UPDATED: Removed border as requested
            // borderRadius: '4px', border: '1px solid #10b981',
            textShadow: '0px 0px 4px #000000', // Added text shadow for visibility without bg
            opacity: '1', transition: 'opacity 0.5s',
            // boxShadow: '0 2px 10px rgba(0,0,0,0.5)'
        });

        overlay.addEventListener('mousedown', startDrag);
        document.body.appendChild(overlay);

        setTimeout(() => {
            if (!isDragging) {
                overlay.style.opacity = '0';
                setTimeout(() => { if (overlay && overlay.parentNode) overlay.remove(); }, 500);
            }
        }, 1000); // 1 second display as requested
    });
}

function startDrag(e) {
    isDragging = true;
    const overlay = document.getElementById('mcq-answer-overlay');
    overlay.style.transition = 'none';
    overlay.style.opacity = '1';
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    const rect = overlay.getBoundingClientRect();
    overlayLeft = rect.left;
    overlayTop = rect.top;
    document.addEventListener('mousemove', onDrag);
    document.addEventListener('mouseup', stopDrag);
    e.preventDefault();
}

function onDrag(e) {
    if (!isDragging) return;
    const overlay = document.getElementById('mcq-answer-overlay');
    const deltaX = e.clientX - dragStartX;
    const deltaY = e.clientY - dragStartY;
    overlay.style.left = (overlayLeft + deltaX) + 'px';
    overlay.style.top = (overlayTop + deltaY) + 'px';
}

function stopDrag(e) {
    isDragging = false;
    document.removeEventListener('mousemove', onDrag);
    document.removeEventListener('mouseup', stopDrag);
    const overlay = document.getElementById('mcq-answer-overlay');
    if (!overlay) return;
    const rect = overlay.getBoundingClientRect();
    chrome.storage.local.set({ overlayX: rect.left, overlayY: rect.top });
    overlay.style.transition = 'opacity 0.5s';
}

// === ACTIVATION ===
document.addEventListener('click', (e) => {
    // IGNORE clicks generated by script (The Hand)
    if (!e.isTrusted) return;

    if (activationMode !== 'tripleclick') return;
    clickCount++;
    console.log(`🖱️ [ACTIVATION] Click count: ${clickCount}`);
    if (clickCount === 1) {
        tripleClickTimer = setTimeout(() => { clickCount = 0; }, 500);
    }
    if (clickCount === 3) {
        clearTimeout(tripleClickTimer);
        clickCount = 0;
        console.log(`🚀 [ACTIVATION] Triple click detected! Sending capture command...`);

        try {
            chrome.runtime.sendMessage({ action: 'capture', captureMode: 'fullscreen' }, (response) => {
                if (chrome.runtime.lastError) {
                    console.error("❌ [FATAL] Background Script Error:", chrome.runtime.lastError.message);
                    alert("Extension Error: Please Reload the Extension in chrome://extensions");
                } else {
                    console.log("✅ Command sent to background script.");
                }
            });
        } catch (e) {
            console.error("❌ [CRITICAL] Extension Context Invalidated. Reload page.", e);
        }
    }
});
