const OpenAI = require('openai');
const openai = new OpenAI({
  apiKey: "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",
  baseURL: 'https://integrate.api.nvidia.com/v1',
});

async function main() {
  try {
    const completion = await openai.chat.completions.create({
      model: "nvidia/nemotron-mini-4b-instruct",
      messages: [{"role":"user","content":"test"}],
      temperature: 0.2,
      top_p: 0.7,
      max_tokens: 1024,
      stream: false
    });
    console.log("SUCCESS:", completion.choices[0].message.content);
  } catch (e) {
    console.error("ERROR:", e);
  }
}
main();
