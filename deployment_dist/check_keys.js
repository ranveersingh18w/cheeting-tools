const MultiKeyManager = require('./managers/MultiKeyManager');

async function testKeys() {
    console.log("🔍 Starting API Key Verification...");

    // Initialize Manager
    require('dotenv').config();
    const manager = new MultiKeyManager();

    // Add env key if exists (simulating server.js behavior)
    if (process.env.GENAI_API_KEY) {
        manager.addKey(process.env.GENAI_API_KEY);
    }

    const keys = manager.processors;
    console.log(`ℹ️  Found ${keys.length} API Keys to test.\n`);

    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < keys.length; i++) {
        const processor = keys[i];
        const keyPreview = processor.apiKey ? processor.apiKey.slice(0, 8) + '...' : 'Unknown';

        console.log(`[Key #${i + 1} | ${keyPreview}] Testing...`);

        // We will try Tier 1 first (Gemini 3.0 Flash Preview)
        // We construct a simple text-only request
        // NOTE: The TieredProcessor expects imageParts for the prompt structure we defined.
        // We'll create a dummy 1x1 pixel base64 image to satisfy requirements if needed, 
        // or just pass main prompt if the new SDK handles text-only well (it should).

        // TieredKeyProcessor.js logic:
        // const contents = [...mediaParts, textPart];
        // So we can pass empty imageParts array.

        try {
            const response = await processor.processRequest("Hello, reply with the word 'OK' only.", []);

            if (response && response.trim().includes('OK')) {
                console.log(`   ✅ Success! Response: "${response.trim()}"`);
                successCount++;
            } else {
                console.log(`   ⚠️  Received unexpected response: "${response}"`);
                successCount++; // Still a technical success
            }
        } catch (error) {
            console.error(`   ❌ Failed: ${error.message}`);
            failCount++;
        }
        console.log('--------------------------------------------------');
    }

    console.log(`\n🏁 Verification Complete.`);
    console.log(`✅ Working: ${successCount}`);
    console.log(`❌ Failed:  ${failCount}`);

    if (failCount > 0) {
        process.exit(1);
    } else {
        process.exit(0);
    }
}

testKeys();
