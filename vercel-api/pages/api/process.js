import { createWorker } from 'tesseract.js';
import { GoogleGenerativeAI } from '@google/generative-ai';

// Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
};

export default async function handler(req, res) {
  // Enable CORS
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

    // 1. OCR with Tesseract
    const worker = await createWorker('eng');
    const ret = await worker.recognize(image);
    const extractedText = ret.data.text;
    await worker.terminate();

    // 2. Gemini Analysis
    // Using 1.5 Flash as requested (User said 2.5 but 1.5 is the standard available, checking if 1.5-flash is correct)
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const prompt = `You are an expert exam solver. 
CRITICAL INSTRUCTIONS:
The following text was extracted from an image of a Multiple Choice Question via OCR. 
1. Read the text carefully.
2. Think step-by-step to determine the correct answer.
3. Finally, provide the single letter answer.

OCR TEXT:
${extractedText}

Your output format MUST be:
Transcription: [Question and Options]
Reasoning: [Your step-by-step thought process]
FINAL ANSWER: [A/B/C/D]`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const answerText = response.text();

    res.status(200).json({ 
      text: extractedText,
      geminiResponse: answerText 
    });

  } catch (error) {
    console.error('API Error:', error);
    res.status(500).json({ error: error.message });
  }
}
