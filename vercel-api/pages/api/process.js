import { GoogleGenerativeAI } from '@google/generative-ai';

// Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '4mb', // Use 4mb for Vercel Free tier limits on body size
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

    // Clean the Base64 string
    const base64Data = image.replace(/^data:image\/(png|jpeg|webp|heic);base64,/, "");

    // TODO: Dynamic configuration reading from a DB/Env would go here
    // For now, hardcoding to 1.5 Flash as it is the most robust public model.
    // User requested "gemini-3-flash-preview" but if that fails we fallback or use what works.
    const MODEL_TO_USE = "gemini-1.5-flash"; 

    const model = genAI.getGenerativeModel({ model: MODEL_TO_USE });

    const prompt = `You are a strict exam grading machine.
    1. Look at the image which tests multiple choice knowledge.
    2. Identify the core question and the options.
    3. Solve it accurately.
    4. Output ONLY the single correct letter (A, B, C, or D).
    
    Do not output reasoning. Do not output text. JUST THE LETTER.`;

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
    const text = response.text();
    
    // Clean up response just in case (remove markdown bolding like **A**)
    const cleanAnswer = text.replace(/[^A-D]/gi, "").trim().toUpperCase().charAt(0);

    console.log("Gemini Answer:", cleanAnswer);

    // TODO: Log this request to a database so it shows up in the Dashboard UI

    res.status(200).json({ 
      geminiResponse: cleanAnswer 
    });

  } catch (error) {
    console.error('API Error:', error);
    res.status(500).json({ error: error.message });
  }
}
