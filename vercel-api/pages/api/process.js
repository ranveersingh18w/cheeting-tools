import { GoogleGenerativeAI } from '@google/generative-ai';

// GLOBAL IN-MEMORY STORAGE (Simulated Database)
// Note: In a real production deployment with many users, use Redis or Firebase.
if (!global.requestStore) {
  global.requestStore = new Map();
}

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '4mb',
    },
  },
};

export default async function handler(req, res) {
  // Common CORS setup
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { action } = req.query; // ?action=create, poll, list, solve

  try {
    // 1. CREATE REQUEST (From Extension)
    if (req.method === 'POST' && (!action || action === 'create')) { // Default POLL logic needs to change to CREATE
      // If extension sends raw body provided in previous steps, it expects immediate response.
      // But we are changing architecture.
      
      const { image } = req.body;
      if (!image) return res.status(400).json({ error: 'No image provided' });

      // Generate ID
      const requestId = Date.now().toString();
      
      // Store in Global Memory
      global.requestStore.set(requestId, {
        id: requestId,
        timestamp: Date.now(),
        image: image, // Store full image to show in dashboard
        status: 'pending', // pending, completed
        answer: null
      });

      console.log(`🆕 New Request Queued: ${requestId}`);
      
      // Return ID to extension so it can start polling
      return res.status(200).json({ 
        success: true, 
        requestId: requestId,
        message: 'Request queued. Waiting for dashboard approval.'
      });
    }

    // 2. POLL STATUS (From Extension)
    if (req.method === 'GET' && action === 'poll') {
      const { id } = req.query;
      const request = global.requestStore.get(id);

      if (!request) return res.status(404).json({ error: 'Request expired or not found' });

      if (request.status === 'completed') {
        return res.status(200).json({ status: 'completed', answer: request.answer });
      } else {
        return res.status(200).json({ status: 'pending' });
      }
    }

    // 3. LIST REQUESTS (From Dashboard)
    if (req.method === 'GET' && action === 'list') {
      // Return all requests (simplification)
      const list = Array.from(global.requestStore.values()).map(r => ({
        id: r.id,
        timestamp: r.timestamp,
        status: r.status,
        image: r.image, // Send image to dashboard
        answer: r.answer
      })).sort((a,b) => b.timestamp - a.timestamp); // Newest first

      return res.status(200).json({ requests: list });
    }

    // 4. SOLVE / ANSWER (From Dashboard)
    if (req.method === 'POST' && action === 'solve') {
      const { id, answer, model: modelName } = req.body;
      const request = global.requestStore.get(id);
      
      if (!request) return res.status(404).json({ error: 'Request not found' });

      // If user provided a manual answer
      if (answer) {
        request.status = 'completed';
        request.answer = answer;
        global.requestStore.set(id, request);
        return res.status(200).json({ success: true, method: 'manual' });
      }

      // If user requested AI generation
      if (modelName) {
        console.log(`🤖 generating with ${modelName} for ${id}`);
        // Call Gemini
        const model = genAI.getGenerativeModel({ model: modelName });
        const base64Data = request.image.replace(/^data:image\/(png|jpeg|webp|heic);base64,/, "");

        const prompt = `You are a strict exam grading machine.
        1. Output ONLY the single correct letter (A, B, C, or D).
        2. Do not output text. JUST THE LETTER.`;

        const result = await model.generateContent([
          prompt,
          { inlineData: { data: base64Data, mimeType: "image/png" } },
        ]);
        
        const response = await result.response;
        const text = response.text();
        const cleanAnswer = text.replace(/[^A-D]/gi, "").trim().toUpperCase().charAt(0);
        
        // Update Store
        request.status = 'completed';
        request.answer = cleanAnswer;
        global.requestStore.set(id, request);
        
        return res.status(200).json({ success: true, method: 'ai', result: cleanAnswer });
      }
    }

    return res.status(400).json({ error: 'Invalid action' });

  } catch (error) {
    console.error('API Error:', error);
    res.status(500).json({ error: error.message });
  }
}
