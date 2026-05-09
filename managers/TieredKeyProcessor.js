const OpenAI = require('openai');

/**
 * Manages request distribution across multiple API keys using NVIDIA NIM OpenAI SDK.
 */
class RequestProcessor {
    constructor(apiKey) {
        // Fallback to process.env.NVIDIA_API_KEY if specific key isn't provided or is dummy
        this.apiKey = apiKey || process.env.NVIDIA_API_KEY;
        this.openai = new OpenAI({
            apiKey: this.apiKey,
            baseURL: 'https://integrate.api.nvidia.com/v1',
        });

        this.tiers = [
            {
                id: 'tier1',
                modelName: 'nvidia/nemotron-mini-4b-instruct',
                maxConcurrent: 5,
                cooldownMs: 1000,
                activeRequests: 0,
                cooldownUntil: 0,
                name: 'NVIDIA Nemotron Mini 4B'
            }
        ];
    }

    async processRequest(prompt, imageParts) {
        const tier = this.tiers[0];
        if (this.isTierAvailable(tier)) {
            return await this.executeWithTier(tier, prompt, imageParts, false);
        }
        console.log("⚠️ NVIDIA Tier is busy/cooling.");
        return null; 
    }

    isTierAvailable(tier) {
        const now = Date.now();
        if (now < tier.cooldownUntil) return false;
        if (tier.activeRequests >= tier.maxConcurrent) return false;
        return true;
    }

    async executeWithTier(tier, prompt, imageParts, allowInternalFailover = true) {
        tier.activeRequests++;
        console.log(`🚀 Sending request to ${tier.name} [Active: ${tier.activeRequests}]`);

        try {
            // We use the prompt text directly since this is a text model
            const completion = await this.openai.chat.completions.create({
                model: tier.modelName,
                messages: [{"role": "user", "content": prompt}],
                temperature: 0.2,
                top_p: 0.7,
                max_tokens: 1024,
                stream: false // Returning full text instead of streaming for API usage
            });

            const text = completion.choices[0]?.message?.content || "";

            tier.activeRequests--;
            return text;

        } catch (error) {
            tier.activeRequests--;
            console.error(`❌ Error on ${tier.name}: ${error.message}`);

            tier.cooldownUntil = Date.now() + tier.cooldownMs;
            console.log(`❄️ Triggering ${tier.cooldownMs / 1000}s cooldown for ${tier.name}`);

            throw error; // Throw so Manager catches it
        }
    }

    // === METHODS FOR MULTI-KEY ORCHESTRATION ===

    isTierReady(tierIndex) {
        // We only have 1 tier for NVIDIA right now
        if (tierIndex !== 0) return false;
        return this.isTierAvailable(this.tiers[0]);
    }

    async processOnTier(tierIndex, prompt, imageParts) {
        if (tierIndex !== 0) throw new Error("Invalid Tier");
        const tier = this.tiers[tierIndex];

        if (!this.isTierAvailable(tier)) throw new Error("Tier Busy");

        return await this.executeWithTier(tier, prompt, imageParts, false);
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
