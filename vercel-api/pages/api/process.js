import { GoogleGenerativeAI } from '@google/generative-ai';

// Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '4mb', // Lower limit to be safe on Vercel Free Tier
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

    // Clean the Base64 string (remove data URL header if present)
    const base64Data = image.replace(/^data:image\/(png|jpeg|webp|heic);base64,/, "");

    // Initialize Gemini 1.5 Flash (Standard efficient model)
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    // Construct the Multimodal Prompt
    const prompt = `You are an expert exam solver. 
    1. Analyze the image provided, which contains a Multiple Choice Question.
    2. Read the text and options from the image.
    3. Think step-by-step to find the correct answer.
    
    Output Format:
    Transcription: [Write out the question text you see]
    Reasoning: [Brief step-by-step logic]
    FINAL ANSWER: [The correct option letter]`;

    // Send Image + Text to Gemini
    const result = await model.generateContent([
      prompt,
      {
        inlineData: {
          data: base64Data,
          mimeType: "image/png", 
        },
      },
    ]);

    const response = await result.response;
    const answerText = response.text();

    res.status(200).json({ 
      geminiResponse: answerText 
    });

  } catch (error) {
    console.error('API Error:', error);
    res.status(500).json({ error: error.message });
  }
}
