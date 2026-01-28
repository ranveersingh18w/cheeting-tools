const TieredKeyProcessor = require('./TieredKeyProcessor');
const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '../data/api-keys.json');

class MultiKeyManager {
    constructor() {
        this.processors = [];
        this.loadKeys();
    }

    loadKeys() {
        try {
            if (fs.existsSync(DATA_FILE)) {
                const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
                this.processors = data.keys.map(key => new TieredKeyProcessor(key));
                console.log(`✅ Loaded ${this.processors.length} API keys`);
            }
        } catch (error) {
            console.error('Error loading API keys:', error);
        }
    }

    saveKeys() {
        try {
            const keys = this.processors.map(p => p.apiKey);
            fs.writeFileSync(DATA_FILE, JSON.stringify({ keys }, null, 2));
        } catch (error) {
            console.error('Error saving API keys:', error);
        }
    }

    addKey(apiKey) {
        const processor = new TieredKeyProcessor(apiKey);
        this.processors.push(processor);
        this.saveKeys();
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
        for (let i = 0; i < this.processors.length; i++) {
            const processor = this.processors[i];
            const result = await processor.processRequest(prompt, imageParts);

            if (result !== null) {
                console.log(`✅ Request completed using API Key #${i + 1}`);
                return result;
            }
        }

        throw new Error('All API keys are busy or in cooldown');
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
}

module.exports = MultiKeyManager;
