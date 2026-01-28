const { GoogleGenAI } = require("@google/genai");

/**
 * Manages request distribution across multiple Gemini model tiers using the new @google/genai SDK.
 */
class RequestProcessor {
    constructor(apiKey) {
        this.apiKey = apiKey;
        this.genAI = new GoogleGenAI({ apiKey: apiKey });

        this.tiers = [
            {
                id: 'tier1',
                modelName: 'gemini-3-flash-preview',
                maxConcurrent: 5,
                cooldownMs: 1000,
                activeRequests: 0,
                cooldownUntil: 0,
                name: 'Gemini 3.0 Flash Preview'
            },
            {
                id: 'tier2',
                modelName: 'gemini-2.5-flash',
                maxConcurrent: 5,
                cooldownMs: 60 * 1000,
                activeRequests: 0,
                cooldownUntil: 0,
                name: 'Gemini 2.5 Flash'
            },
            {
                id: 'tier3',
                modelName: 'gemini-2.0-flash',
                maxConcurrent: 2,
                cooldownMs: 60 * 1000,
                activeRequests: 0,
                cooldownUntil: 0,
                name: 'Gemini 2.0 Flash'
            }
        ];
    }

    /**
     * Process a request using the best available model.
     * @param {string} prompt The text prompt
     * @param {Array} imageParts Array of image parts { inlineData: { data, mimeType } }
     * @returns {Promise<string>} The text response
     */
    async processRequest(prompt, imageParts) {
        // Find checking order: Tier 1 -> Tier 2 -> Tier 3
        for (const tier of this.tiers) {
            if (this.isTierAvailable(tier)) {
                return await this.executeWithTier(tier, prompt, imageParts);
            }
        }

        console.log("⚠️ All tiers in this key are busy/cooling.");
        return null; // Return null to signal the MultiKeyManager to try another API Key.
    }

    isTierAvailable(tier) {
        const now = Date.now();
        if (now < tier.cooldownUntil) return false;
        if (tier.activeRequests >= tier.maxConcurrent) return false;
        return true;
    }

    async executeWithTier(tier, prompt, imageParts) {
        tier.activeRequests++;
        console.log(`🚀 Sending request to ${tier.name} [Active: ${tier.activeRequests}]`);

        try {
            // Updated SDK Usage
            // Convert imageParts (legacy format) to SDK format
            // Legacy: { inlineData: { data: 'base64', mimeType: 'image/png' } }
            // New SDK: { inlineData: { data: 'base64', mimeType: 'image/png' } } 

            // Actually the new SDK structure is slightly different in `contents`.
            // The prompt "This is... answer ONLY with JSON" is text.

            // Construct contents array
            const textPart = { text: prompt };
            const mediaParts = imageParts.map(part => ({
                inlineData: {
                    data: part.inlineData.data,
                    mimeType: part.inlineData.mimeType
                }
            }));

            const contents = [...mediaParts, textPart];

            const response = await this.genAI.models.generateContent({
                model: tier.modelName,
                contents: contents
            });

            // The SDK returns response.text() directly? Or response.text
            // Based on user snippet: console.log(response.text);

            // However, documentation says:
            // const result = await model.generateContent(...)
            // console.log(result.response.text())
            // BUT user provided snippet:
            // const response = await ai.models.generateContent({...});
            // console.log(response.text());

            // Let's trust the user snippet logic but verify against common patterns.
            // If response.text is a function, call it. If property, return it.

            let text = "";
            if (typeof response.text === 'function') {
                text = response.text();
            } else if (response.text) {
                text = response.text;
            } else if (response.candidates && response.candidates[0] && response.candidates[0].content && response.candidates[0].content.parts) {
                // Manual extraction worst case
                text = response.candidates[0].content.parts.map(p => p.text).join('');
            }

            tier.activeRequests--;
            return text;

        } catch (error) {
            tier.activeRequests--;
            console.error(`❌ Error on ${tier.name}: ${error.message}`);

            tier.cooldownUntil = Date.now() + tier.cooldownMs;
            console.log(`❄️ Triggering ${tier.cooldownMs / 1000}s cooldown for ${tier.name}`);

            const failIndex = this.tiers.indexOf(tier);
            const nextTier = this.tiers[failIndex + 1];

            if (nextTier) {
                console.log(`🔄 Failing over to next tier: ${nextTier.name}`);
                return await this.executeWithTier(nextTier, prompt, imageParts);
            }

            throw error;
        }
    }

    getRequestStatus() {
        return this.tiers.map(t => ({
            name: t.name,
            active: t.activeRequests,
            status: Date.now() < t.cooldownUntil ? `Cooling (${Math.ceil((t.cooldownUntil - Date.now()) / 1000)}s)` : 'Ready'
        }));
    }
}

module.exports = RequestProcessor;
