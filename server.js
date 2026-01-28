const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const bodyParser = require('body-parser');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static('public'));

// Setup multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB limit
});

// In-memory storage for pending requests
const pendingRequests = new Map();
let requestId = 0;

// ============= API ENDPOINTS =============


// Initialize MultiKeyManager
require('dotenv').config();
const MultiKeyManager = require('./managers/MultiKeyManager');
const DeviceManager = require('./managers/DeviceManager');
const SupabaseManager = require('./managers/SupabaseManager');

const processor = new MultiKeyManager();
const deviceManager = new DeviceManager();
const supabase = new SupabaseManager();

// Add default key if provided in .env
if (process.env.GENAI_API_KEY) {
  processor.addKey(process.env.GENAI_API_KEY);
}

/**
 * POST /api/upload-image
 * Receives image from extension, sends to Gemini, returns answer
 */
app.post('/api/upload-image', upload.single('image'), async (req, res) => {
  try {
    // === 1. PARSE INPUT (Universal Handler) ===
    let imageBase64 = null;
    let mimeType = 'image/png';
    let promptInput = req.body.prompt || null;
    let requestType = req.body.type || 'mcq'; // 'mcq', 'answer', 'normal'

    // Handle File Upload (Extension / Multipart)
    if (req.file) {
      imageBase64 = req.file.buffer.toString('base64');
      mimeType = req.file.mimetype;
    }
    // Handle Direct JSON Base64 (Python / API)
    else if (req.body.image) {
      // Remove data URL prefix if present
      imageBase64 = req.body.image.replace(/^data:image\/\w+;base64,/, '');
      // Try to determine mime (simple fallback)
      if (req.body.image.startsWith('data:image/jpeg')) mimeType = 'image/jpeg';
      else if (req.body.image.startsWith('data:image/webp')) mimeType = 'image/webp';
    }

    // Handle Legacy Extension "Auto Click" flag -> maps to 'answer' type
    if (req.body.autoClickEnabled === 'true') {
      requestType = 'answer';
    }

    const { deviceId } = req.body;
    const finalDeviceId = deviceId || 'unknown_device';

    // === 2. REGISTER DEVICE & SYNC ===
    const dev = deviceManager.registerDevice(finalDeviceId);
    supabase.upsertDevice(finalDeviceId, dev.autoAnswer);

    // Cancel previous pending for this device
    for (let [key, val] of pendingRequests) {
      if (val.deviceId === finalDeviceId && val.status === 'pending') {
        val.status = 'cancelled';
      }
    }

    requestId++;
    const id = `req_${requestId}`;

    console.log(`✅ Request ${id} [${requestType}] from ${finalDeviceId}`);

    // === 3. CREATE REQUEST OBJECT ===
    const newRequest = {
      id: id,
      deviceId: finalDeviceId,
      status: 'pending',
      // If we have an image, store string for UI. If text-only, store null or placeholder.
      image: imageBase64 ? `data:${mimeType};base64,${imageBase64}` : null,
      shortImage: imageBase64,
      mimeType: mimeType,
      promptInput: promptInput, // Custom prompt for 'normal' mode
      type: requestType,
      answer: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      hiddenFromLog: false
    };
    pendingRequests.set(id, newRequest);

    // Sync to Supabase
    supabase.createRequest(newRequest);

    // === 4. PROCESS LOGIC ===
    // Check if we should process immediately (Auto-Answer enabled OR API request)
    // For API users (providing type/prompt), we usually want immediate results.
    // For Extension users, we check the device manager auto-answer toggle.

    const isDeviceAuto = deviceManager.isAutoAnswerEnabled(finalDeviceId);

    // If it's a direct API call (no file, just body) OR device is auto -> PROCESS
    // But check Global Master Switch first!
    if ((isDeviceAuto || !req.file || requestType === 'normal') && GLOBAL_AUTO_ANSWER) {
      processAI(id, res);
    } else {
      // Manual Review Mode (or Global Off)
      // Even if device is auto, if Global is OFF, we wait.
      console.log(`⏸️ Request ${id} held (GlobalAuto: ${GLOBAL_AUTO_ANSWER})`);
      res.json({
        success: true,
        requestId: id,
        status: 'pending',
        message: 'Waiting for manual approval'
      });
    }

  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

async function processAI(id, res) {
  const request = pendingRequests.get(id);
  if (!request || request.status === 'cancelled') return;

  try {
    let prompt;

    // === SELECT PROMPT BASED ON TYPE ===
    if (request.type === 'normal') {
      // Normal Mode: Use user provided prompt or unexpected default
      prompt = request.promptInput || "Analyze this.";
    }
    else if (request.type === 'answer') {
      // ANSWER Mode: Extract exact text (for auto-clicker)
      prompt = `This is a multiple choice question. Analyze the image.
        1. Identify the correct answer.
        2. Extract the EXACT text of that answer option.
        3. Return a valid JSON object:
        { "answer": "The Exact Answer Text Here" }
        Answer ONLY with the JSON.`;
    }
    else {
      // MCQ Mode (Default): Extract Letter (A/B/C/D) + Click Details
      prompt = `This is a multiple choice question. Analyze the image and identify the correct answer.
        Return a valid JSON object strictly following this format:
        {
          "answer": "A", 
          "click_details": {
            "target_text": "The exact text of the correct answer option related to the letter",
            "ordinal_index": 0
          }
        }
        Ensure "answer" is just the letter A, B, C, or D.
        Answer ONLY with the JSON.`;
    }

    // Prepare content parts
    const imageParts = [];
    if (request.shortImage) {
      imageParts.push({
        inlineData: { data: request.shortImage, mimeType: request.mimeType }
      });
    }

    // Execute AI
    let text = await processor.processRequest(prompt, imageParts);

    // Check cancellation
    if (request.status === 'cancelled') {
      if (res) res.json({ success: false, status: 'cancelled' });
      return;
    }

    // === PARSE & FORMAT RESPONSE ===

    // If normal mode, we just return the text directly
    if (request.type === 'normal') {
      console.log(`📝 [NORMAL] Returning raw text response (Length: ${text.length})`);
      request.status = 'completed';
      request.answer = text;
      request.updatedAt = new Date();
      supabase.updateRequest(id, { status: 'completed', answer: text });

      if (res) {
        res.json({
          success: true,
          requestId: id,
          status: 'completed',
          result: text // Field name 'result' for normal mode
        });
      }
      return;
    }

    // For MCQ/Answer modes, we proceed to JSON parsing
    console.log("🔍 [AI RAW] " + text.replace(/\n/g, ' '));
    text = text.replace(/```json/g, '').replace(/```/g, '').trim();
    let parsedResult;
    try {
      parsedResult = JSON.parse(text);
      console.log(`✅ [JSON] Successfully parsed:`, parsedResult);
    } catch (e) {
      console.warn("⚠️ [JSON] Failed to parse JSON, falling back", text);
      parsedResult = { answer: parseAnswerSimple(text), click_details: null };
    }

    const answer = parsedResult.answer || '?';
    console.log(`🏁 [FINAL] Answer determined: "${answer}"`);

    request.status = 'completed';
    request.answer = answer; // Simple letter or Exact text
    request.click_details = parsedResult.click_details;
    request.updatedAt = new Date();

    supabase.updateRequest(id, { status: 'completed', answer: answer });

    if (res) {
      res.json({
        success: true,
        requestId: id,
        status: 'completed',
        answer: answer,
        click_details: parsedResult.click_details
      });
    }
  } catch (e) {
    console.error(`AI Error for ${id}:`, e);
    // Log to file
    const fs = require('fs');
    const logPath = require('path').join(__dirname, 'logs', 'error.log');
    const timestamp = new Date().toISOString();
    try {
      if (!fs.existsSync(require('path').join(__dirname, 'logs'))) fs.mkdirSync(require('path').join(__dirname, 'logs'));
      const logEntry = `[${timestamp}] Request ${id} Error: ${e.message}\nStack: ${e.stack}\n\n`;
      fs.appendFileSync(logPath, logEntry);
    } catch (err) { }

    request.status = 'error';
    if (res) res.status(500).json({ error: 'AI processing failed', details: e.message });
  }
}

function parseAnswerSimple(text) {
  // Fallback simple parsing logic
  let clean = text.replace(/[^A-D]/gi, '').toUpperCase();
  if (clean.length > 0) return clean[0];
  return '?';
}

// === Device Endpoints ===

app.get('/api/devices', (req, res) => {
  res.json({ success: true, devices: deviceManager.getAllDevices() });
});

app.post('/api/devices/:deviceId/toggle-auto', (req, res) => {
  const { enabled } = req.body; // boolean
  const device = deviceManager.toggleAutoAnswer(req.params.deviceId, enabled);
  supabase.upsertDevice(req.params.deviceId, enabled); // Sync
  res.json({ success: true, device });
});

// Global Auto-Answer Toggle
let GLOBAL_AUTO_ANSWER = true;

app.post('/api/toggle-global-auto', (req, res) => {
  const { enabled } = req.body;
  GLOBAL_AUTO_ANSWER = enabled;
  console.log(`🌍 Global Auto-Answer set to: ${enabled}`);
  res.json({ success: true, enabled: GLOBAL_AUTO_ANSWER });
});

app.get('/api/global-auto', (req, res) => {
  res.json({ success: true, enabled: GLOBAL_AUTO_ANSWER });
});

// === Load Keys from Supabase on Start ===
// === Load Keys from Supabase on Start ===
async function syncKeys() {
  const keys = await supabase.getApiKeys();
  console.log(`🔑 Syncing: Found ${keys.length} API keys in Supabase.`);

  // RESET Processors (Keep only Env Key if exists?)
  processor.processors = [];

  // 1. Re-add Env Key (if set)
  if (process.env.GENAI_API_KEY) {
    processor.addKey(process.env.GENAI_API_KEY);
  }

  // 2. Add Supabase Keys (Deduplicate against Env Key)
  for (const k of keys) {
    // checks implicitly handled by addKey? No, addKey adds blindly. 
    // We should check duplication.
    const isDuplicate = processor.processors.some(p => p.apiKey === k.key);
    if (!isDuplicate) {
      processor.addKey(k.key);
    }
  }

  console.log(`✅ Sync Complete. Total Active Keys: ${processor.processors.length}`);
  return processor.getFullKeys();
}

// Initial Sync
(async () => {
  await syncKeys();
})();

app.post('/api/keys/sync', async (req, res) => {
  try {
    const keys = await syncKeys();
    res.json({ success: true, keys });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/requests/:requestId/approve', async (req, res) => {
  const { requestId } = req.params;
  const { answer } = req.body; // Optional manual answer override

  const request = pendingRequests.get(requestId);
  if (!request) return res.status(404).json({ error: 'Not found' });

  if (answer) {
    // Manual answer provided
    request.status = 'completed';
    request.answer = answer;
    request.updatedAt = new Date();

    // Sync
    supabase.updateRequest(requestId, { status: 'completed', answer: answer });

    res.json({ success: true, request });
  } else {
    // Trigger AI processing for this held request
    // Since we don't have the res object of the original request, 
    // the client (extension) needs to be polling /api/answer/:id 
    // OR used long-polling.
    // For simplicity, we just process it and update state.
    // Extension polling will pick it up.

    // We need the image data. Ideally we shouldn't have stored base64 in memory twice 
    // but for now retrieve from the pending object (we kept shortImage there temporarily? 
    // Ah, I added `shortImage` property in my rewrite above).

    res.json({ success: true, message: 'Processing started' });
    await processAI(requestId, null);
  }
});

// Clear Logs (Hide from feed only)
app.delete('/api/logs', (req, res) => {
  for (let req of pendingRequests.values()) {
    req.hiddenFromLog = true;
  }
  res.json({ success: true });
});

// Get Device Specific Requests (History)
app.get('/api/devices/:deviceId/requests', (req, res) => {
  const { deviceId } = req.params;
  const requests = Array.from(pendingRequests.values())
    .filter(r => r.deviceId === deviceId)
    .map(r => ({
      id: r.id,
      status: r.status,
      answer: r.answer,
      createdAt: r.createdAt,
      image: r.image
    }));
  res.json({ success: true, requests });
});

/**
 * GET /api/status/:requestId
 * Check status of a request
 */
app.get('/api/status/:requestId', (req, res) => {
  const { requestId } = req.params;
  const request = pendingRequests.get(requestId);

  if (!request) {
    return res.status(404).json({ error: 'Request not found' });
  }

  res.json({
    success: true,
    requestId: requestId,
    status: request.status,
    answer: request.answer,
    image: request.image // Include for UI
  });
});

/**
 * POST /api/submit-answer/:requestId
 * Submit manual answer for a request
 */
app.post('/api/submit-answer/:requestId', (req, res) => {
  try {
    const { requestId } = req.params;
    const { answer } = req.body;

    if (!answer || !['A', 'B', 'C', 'D'].includes(answer.toUpperCase())) {
      return res.status(400).json({ error: 'Invalid answer. Must be A, B, C, or D' });
    }

    const request = pendingRequests.get(requestId);
    if (!request) {
      return res.status(404).json({ error: 'Request not found' });
    }

    // Update request with answer
    request.status = 'completed';
    request.answer = answer.toUpperCase();
    request.updatedAt = new Date();

    console.log(`✅ Answer submitted for ${requestId}: ${answer.toUpperCase()}`);

    res.json({
      success: true,
      requestId: requestId,
      status: 'completed',
      answer: answer.toUpperCase(),
      message: 'Answer recorded successfully'
    });
  } catch (error) {
    console.error('❌ Error submitting answer:', error);
    res.status(500).json({ error: 'Failed to submit answer', details: error.message });
  }
});

/**
 * GET /api/answer/:requestId
 * Get the answer for a request (called by extension)
 */
app.get('/api/answer/:requestId', (req, res) => {
  const { requestId } = req.params;
  const request = pendingRequests.get(requestId);

  if (!request) {
    return res.status(404).json({ error: 'Request not found' });
  }

  if (request.status === 'pending') {
    return res.status(202).json({
      success: false,
      status: 'pending',
      message: 'Answer is still pending. Check back later.'
    });
  }

  res.json({
    success: true,
    status: 'completed',
    answer: request.answer,
    click_details: request.click_details,
    message: 'Answer is ready'
  });
});

/**
 * GET /api/all-requests
 * Get all requests (for dashboard)
 */
app.get('/api/all-requests', (req, res) => {
  const requests = Array.from(pendingRequests.values())
    .filter(req => !req.hiddenFromLog) // Only show non-hidden
    .map(req => ({
      id: req.id,
      deviceId: req.deviceId,
      status: req.status,
      answer: req.answer,
      createdAt: req.createdAt,
      updatedAt: req.updatedAt,
      image: req.image // Include full image for thumbnail
    }));

  // Also include system status
  const systemStatus = processor.getRequestStatus();

  res.json({
    success: true,
    count: requests.length,
    systemStatus: systemStatus,
    requests: requests
  });
});

/**
 * GET /api/keys
 * Get all API keys
 */
app.get('/api/keys', (req, res) => {
  res.json({
    success: true,
    keys: processor.getKeys()
  });
});

app.post('/api/keys', async (req, res) => {
  const { apiKey } = req.body;
  if (!apiKey) {
    return res.status(400).json({ error: 'API key required' });
  }

  // Add to persistence
  await supabase.addApiKey(apiKey);

  // Add to memory
  const result = processor.addKey(apiKey);
  res.json(result);
});

/**
 * DELETE /api/keys/:index
 * Remove an API key
 */
app.delete('/api/keys/:index', async (req, res) => {
  const index = parseInt(req.params.index);

  // We need to resolve index to actual key ID for Supabase deletion if we want full sync
  // But MultiKeyManager doesn't store IDs. 
  // Simplified: We reload keys from Supabase or just delete from memory now.
  // Ideally, UI should send Key ID, not Index.
  // For now, let's just delete from memory. To delete from DB, user needs a proper management UI.
  // Wait, I am building the management UI. I should return the full key object with IDs.

  const result = processor.removeKey(index);
  res.json(result);
});

// NEW: Delete by value (better for UI sync)
app.delete('/api/keys', async (req, res) => {
  const { id } = req.body;

  if (id) {
    if (typeof id === 'string' && id.startsWith('mem_')) {
      // Memory Delete
      const index = parseInt(id.split('_')[1]);
      processor.removeKey(index);
    } else {
      // Supabase Delete
      await supabase.deleteApiKey(id);

      // Reload memory from DB to ensure sync
      const keys = await supabase.getApiKeys();
      if (keys && keys.length > 0) {
        processor.processors = [];
        keys.forEach(k => processor.addKey(k.key));
      } else {
        // DB is empty, or failed. Do not clear memory indiscriminately if DB failed.
        // But if DB returned [], it means we deleted the last key.
        // If DB failed, keys is [] (from my SupabaseManager logic).
        // Hard to distinguish empty vs error in SupabaseManager wrapper (it returns [] for error too).
        // Safest: If we deleted a legitimate ID, we assume we want to sync.
        processor.processors = [];
      }
    }

    return res.json({ success: true });
  }
  res.status(400).json({ error: 'ID required' });
});

app.get('/api/keys-full', async (req, res) => {
  // Get DB Keys
  let keys = await supabase.getApiKeys();

  // Get Memory Keys
  const memKeys = processor.getFullKeys();

  // Merge: If Supabase failed or empty, usage of memory keys is critical.
  if (!keys) keys = [];

  // Add memory keys if they are not in DB list (deduplicate by key string)
  for (const mk of memKeys) {
    if (!keys.find(k => k.key === mk.key)) {
      keys.push(mk);
    }
  }

  res.json({ success: true, keys });
});

/**
 * DELETE /api/clear-requests
 * Clear all completed requests
 */
app.delete('/api/clear-requests', (req, res) => {
  const beforeCount = pendingRequests.size;

  // Keep only pending requests
  for (let [key, value] of pendingRequests) {
    if (value.status !== 'pending') {
      pendingRequests.delete(key);
    }
  }

  const afterCount = pendingRequests.size;
  const deletedCount = beforeCount - afterCount;

  res.json({
    success: true,
    deletedCount: deletedCount,
    remainingRequests: afterCount
  });
});

// ============= SERVE UI =============

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ============= START SERVER =============

app.listen(PORT, () => {
  console.log(`\n✅ MCQ AI Server started on http://localhost:${PORT}`);
  console.log(`📊 Dashboard: http://localhost:${PORT}`);
  console.log(`🔌 API Base: http://localhost:${PORT}/api\n`);
});

module.exports = app;

