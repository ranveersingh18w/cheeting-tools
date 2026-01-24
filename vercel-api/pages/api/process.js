import { createWorker } from 'tesseract.js';
import { GoogleGenerativeAI } from '@google/generative-ai';

// Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb', // Increased limit for OCR processing
    },
  },
};

export default async function handler(req, res) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { image } = req.body;

    if (!image) {
      return res.status(400).json({ error: 'No image provided' });
    }
    
    console.log("Processing image...");

    // 1. OCR with Tesseract
    // We create a worker, recognize, and terminate to be stateless
    const worker = await createWorker('eng');
    const ret = await worker.recognize(image);
    const extractedText = ret.data.text;
    await worker.terminate();
    
    console.log("Extracted Text:", extractedText.substring(0, 100) + "...");

    // 2. Gemini Analysis (TEXT ONLY)
    // Using 1.5 Flash as requested
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const prompt = `You are an expert exam solver. 
CRITICAL NOTE: The following text was extracted from an image of a Multiple Choice Question via OCR. It might have typos.

1. Read the text carefully and reconstruct the question.
2. Think step-by-step to determine the correct answer.
3. Finally, provide the single letter answer.

OCR TEXT:
${extractedText}

Your output format MUST be:
Transcription: [Question and Options]
Reasoning: [Your step-by-step thought process]
FINAL ANSWER: [A/B/C/D]`;

    // Only sending text now
    const result = await model.generateContent(prompt);
    
    const response = await result.response;
    const answerText = response.text();

    console.log("Gemini Answer:", answerText);

    res.status(200).json({ 
      text: extractedText,
      geminiResponse: answerText 
    });

  } catch (error) {
    console.error('API Error:', error);
    res.status(500).json({ error: error.message });
  }
}
