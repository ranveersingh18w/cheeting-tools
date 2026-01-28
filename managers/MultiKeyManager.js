const TieredKeyProcessor = require('./TieredKeyProcessor');
const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '../data/api-keys.json');

class MultiKeyManager {
    constructor() {
        this.processors = [];
        this.loadKeys();
    }

    async loadKeys() {
        // Load from Data File (Legacy)
        try {
            if (fs.existsSync(DATA_FILE)) {
                const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
                for (const key of data.keys) {
                    this.processors.push(new TieredKeyProcessor(key));
                }
            }
        } catch (error) {
            console.error('Error loading local API keys:', error);
        }

        // Load from Supabase (Async)
        // We need an instance of SupabaseManager accessible here.
        // For simplicity, we can pass it or require it (but circular dep if not careful).
        // Let's assume server.js injects specific keys or we handle it in server.js loop.
        // Actually, better pattern: let Server.js initialize this with keys.
    }

    addKey(apiKey) {
        // Avoid duplicates
        const exists = this.processors.find(p => p.apiKey === apiKey);
        if (exists) return { success: false, error: 'Key already exists' };

        const processor = new TieredKeyProcessor(apiKey);
        this.processors.push(processor);
        // We don't save to file anymore as primary source of truth if we use Supabase
        return { success: true, count: this.processors.length };
    }

    removeKey(index) {
        if (index >= 0 && index < this.processors.length) {
            this.processors.splice(index, 1);
            this.saveKeys();
            return { success: true, count: this.processors.length };
        }
        return { success: false, error: 'Invalid index' };
    }

    async processRequest(prompt, imageParts) {
        // STRATEGY: 
        // 1. Try Tier 1 on ALL keys (Key1.T1 -> Key2.T1 ...)
        // 2. If all busy/error, try Tier 2 on ALL keys (Key1.T2 -> Key2.T2 ...)
        // 3. If all busy/error, try Tier 3 on ALL keys (Key1.T3 -> Key2.T3 ...)
        // 4. If all fail, throw error.

        const TOTAL_TIERS = 3; // Assuming all keys have 3 tiers structure as defined in TieredKeyProcessor

        for (let tierIdx = 0; tierIdx < TOTAL_TIERS; tierIdx++) {
            // Attempt this tier across all keys
            for (let processorIdx = 0; processorIdx < this.processors.length; processorIdx++) {
                const processor = this.processors[processorIdx];

                // Check if this key's specific tier is available (no wait list, just instant check)
                if (processor.isTierReady(tierIdx)) {
                    try {
                        console.log(`🤖 Strategy: Trying Key #${processorIdx + 1} | Tier ${tierIdx + 1}`);
                        const result = await processor.processOnTier(tierIdx, prompt, imageParts);
                        if (result !== null) {
                            console.log(`✅ Success: Key #${processorIdx + 1} | Tier ${tierIdx + 1}`);
                            return result;
                        }
                    } catch (e) {
                        console.warn(`⚠️ Failed on Key #${processorIdx + 1} | Tier ${tierIdx + 1}: ${e.message}. Moving to next key...`);
                        // Continue to next key in this tier
                    }
                }
            }
        }

        throw new Error('All Tiers (1-3) across all API keys are busy or exhausted.');
    }

    getRequestStatus() {
        return this.processors.map((processor, index) => ({
            keyIndex: index,
            keyPreview: processor.apiKey ? `...${processor.apiKey.slice(-8)}` : 'N/A',
            tiers: processor.getRequestStatus()
        }));
    }

    getKeys() {
        return this.processors.map((p, i) => ({
            index: i,
            preview: p.apiKey ? `...${p.apiKey.slice(-8)}` : 'N/A'
        }));
    }

    getFullKeys() {
        return this.processors.map((p, i) => ({
            id: `mem_${i}`, // Temporary ID for memory-only keys
            key: p.apiKey,
            created_at: new Date().toISOString()
        }));
    }
}

module.exports = MultiKeyManager;
