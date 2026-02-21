// === CONFIGURATION ===
let tripleClickTimer = null;
let clickCount = 0;
let activationMode = 'tripleclick'; // default
let autoClickEnabled = false; // default
let answerDuration = 5; // default seconds

// Initialize settings
chrome.storage.local.get(['activationMode', 'autoClickEnabled', 'answerDuration'], (result) => {
    if (result.activationMode) activationMode = result.activationMode;
    if (result.autoClickEnabled !== undefined) autoClickEnabled = result.autoClickEnabled;
    if (result.answerDuration) answerDuration = parseInt(result.answerDuration) || 5;
    console.log(`🔧 [CONFIG] Loaded: Activation=${activationMode}, AutoClick=${autoClickEnabled}, Duration=${answerDuration}`);
});

// === MESSAGE LISTENER ===
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'updateSettings') {
        if (request.activationMode) activationMode = request.activationMode;
        if (request.autoClickEnabled !== undefined) autoClickEnabled = request.autoClickEnabled;
        if (request.answerDuration) answerDuration = parseInt(request.answerDuration) || 5;
        console.log(`🔧 [CONFIG] Updated: Activation=${activationMode}, AutoClick=${autoClickEnabled}, Duration=${answerDuration}`);
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

        // Force disable suppression for debug if final
        // The user says "listener is not working" despite logs saying "Received"
        // It might be the logic:
        // if (!autoClickEnabled) {
        //   if (answer.includes("Uploading") || answer.includes("Thinking")) { ... suppressed ... }
        //   else { showAnswerOverlay(...) } 
        // }

        // The user logs show: 
        // Received 'displayAnswer': "C" (Final: true)
        // [AUTO] Skipped. Enabled=false, Final=true

        // If AutoClick is DISABLED (false), we enter the first block.
        // answer="C". Not including "Uploading"/"Thinking".
        // It SHOULD call showAnswerOverlay("C", ...)
        // But the user claims it's not working. 

        // Let's verify showAnswerOverlay function actually works and isn't hidden/removed instantly.
        // One possibility: styles are overriding visibility (opacity 0?) or z-index.
        // OR the previous logic "if (!autoClickEnabled)" is failing if autoClickEnabled is undefined or something weird.
        // It defaults to false.

        // I will simplify the logic to FORCE show overlay if isFinal is true, regardless of silent mode settings,
        // because "C" is the final answer and must be seen.

        // LOGIC FIX: Always show "Error" messages regardless of autoClick
        const isError = answer.toLowerCase().startsWith('error') || answer.toLowerCase().includes('failed') || answer.toLowerCase().includes('timeout');

        // Show overlay if:
        // 1. AutoClick is OFF
        // 2. OR it is the Final Answer (A/B/C/D)
        // 3. OR it is an Error
        if (!autoClickEnabled || isFinal || isError) {
            // UPDATED: Filter out "Uploading..." messages if user finds them annoying
             // Only suppress STATUS messages if in Auto Mode (but we are in !auto or final block, so...)
             
             // If AutoClick is ON: We only want to see IsFinal or Errors. 
             // If we are here, it means (Auto=Off) OR (Final=True) OR (Error=True).
             
             // What if Auto=On, IsFinal=False (e.g. Uploading)?
             // Then !autoClickEnabled is FALSE. isFinal is FALSE. isError is FALSE.
             // We generally skip this block. Correct. Logic holds.

            if (answer.includes("Uploading") || answer.includes("Thinking")) {
                 // If the user wants to see status in manual mode, let them.
                 // Only suppress if they explicitly asked for "no pending status".
                 // For now, allow it.
                console.log(`ℹ️ [VISUAL] Showing status update: "${answer}"`);
                showAnswerOverlay(answer, request.styles, 2000);
            } else {
                console.log(`👁️ [VISUAL] Calling showAnswerOverlay for "${answer}"`);
                // Longer duration for specific types
                let duration = answerDuration * 1000; // Use user defined duration
                if (isError) duration = 8000; // Errors show for 8s always
                showAnswerOverlay(answer, request.styles, duration);
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
             // Suppress intermediate logs if silent
            // console.log(`ℹ️ [AUTO] Ignoring intermediate status: "${answer}"`);
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

        // onMouseUp Logic in startSnippetSelection
        function onMouseUp(e) {
            // Remove listeners
            overlay.removeEventListener('mousemove', onMouseMove);
            overlay.removeEventListener('mouseup', onMouseUp);
            
            // Calculate coordinates BEFORE removing from DOM
            const rect = box.getBoundingClientRect();
            
            // Now remove
            overlay.remove();

            if (rect.width < 5 || rect.height < 5) {
                console.log("Selection too small, assuming cancellation.");
                resolve(null);
                return;
            }
            
            // RESOLVE with coordinates
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

function showAnswerOverlay(answer, styles = {}, duration = 2000) {
    console.log(`👁️ [OVERLAY] Displaying: "${answer}" for ${duration}ms`);
    // Remove if exists
    const existing = document.getElementById('mcq-answer-overlay');
    if (existing) existing.remove();

    chrome.storage.local.get(['overlayX', 'overlayY'], (result) => {
        // Defaults to user preference OR top-left, but let's make it more centered or near mouse if possible for snippets.
        // For now, stick to saved pos.
        let posX = result.overlayX !== undefined ? result.overlayX : 10;
        let posY = result.overlayY !== undefined ? result.overlayY : 10;

        const overlay = document.createElement('div');
        overlay.id = 'mcq-answer-overlay';
        overlay.textContent = answer;

        const defaultStyles = { color: '#00ff00', fontSize: '24' }; // Make default SUPER visible (Green, Large)
        const finalStyles = { ...defaultStyles, ...styles };
        
        // Ensure font size is a number
        const fs = parseInt(finalStyles.fontSize) || 24;

        Object.assign(overlay.style, {
            position: 'fixed', top: posY + 'px', left: posX + 'px',
            color: finalStyles.color, fontSize: fs + 'px',
            fontWeight: '900', fontFamily: 'Arial, sans-serif',
            zIndex: '2147483647', cursor: 'move', userSelect: 'none',
            padding: '8px 12px',
            textShadow: 'none', // Removed outline/shadow as requested
            opacity: '1', transition: 'opacity 0.5s',
            pointerEvents: 'auto' // Ensure it captures mouse events for drag
        });

        overlay.addEventListener('mousedown', startDrag);
        // Important: Append to document.documentElement (html) instead of body to avoid body overflow issues? 
        // Or just body. Body is fine usually.
        document.body.appendChild(overlay);

        console.log(`👁️ [OVERLAY] Appended to body at ${posX},${posY}`);

        if (duration > 0) {
            setTimeout(() => {
                if (!isDragging) {
                    // console.log("👁️ [OVERLAY] Fading out...");
                    overlay.style.opacity = '0';
                    setTimeout(() => { if (overlay && overlay.parentNode) overlay.remove(); }, 500);
                }
            }, duration); 
        }
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
    
    // Check if user is clicking on an interactive element? 
    // Usually triple click selects text. We want to override this?
    // Or maybe just let it happen.
    
    clickCount++;
    console.log(`🖱️ [ACTIVATION] Click count: ${clickCount}`);
    if (clickCount === 1) {
        tripleClickTimer = setTimeout(() => { clickCount = 0; }, 500);
    }
    if (clickCount === 3) {
        clearTimeout(tripleClickTimer);
        clickCount = 0;
        console.log(`🚀 [ACTIVATION] Triple click detected! Checking mode...`);

        // Check storage for preferred capture mode
        chrome.storage.local.get(['captureMode'], (result) => {
            const mode = result.captureMode || 'fullscreen';
            console.log(`🚀 [ACTIVATION] Sending capture command (Mode: ${mode})...`);
            
            try {
                chrome.runtime.sendMessage({ action: 'capture', captureMode: mode }, (response) => {
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
        });
    }
});

// Trigger capture immediately
if (activationMode === 'manual') {
  //...
} else {
  // Just inform the user it's active
}
