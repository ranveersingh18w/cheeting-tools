const axios = require('axios');
const fs = require('fs');
const FormData = require('form-data');

// Configuration
const BASE_URL = 'http://localhost:3000/api';
const IMAGE_PATH = 'public/test-image.jpg'; // We need a dummy image
const TOTAL_REQUESTS = 10;
const TEST_DURATION_MS = 2000; // Send all requests within 2 seconds

// Create a dummy image if it doesn't exist
if (!fs.existsSync(IMAGE_PATH)) {
    console.log("Creating dummy image...");
    // 1x1 white pixel base64 -> buffer
    const buffer = Buffer.from('/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/wAALCAABAAEBAREA/8QAABAAAAACAAAAAAAAAAAAAAAAAAUGB//EABgQAQADAQAAAAAAAAAAAAAAAAABAgME/9oACAEBAAA/APVAf//Z', 'base64');
    // Ensure directory exists
    if (!fs.existsSync('public')) fs.mkdirSync('public');
    fs.writeFileSync(IMAGE_PATH, buffer);
}

async function sendRequest(id) {
    try {
        const formData = new FormData();
        formData.append('image', fs.createReadStream(IMAGE_PATH));

        const startTime = Date.now();
        console.log(`[Req ${id}] Sending...`);

        // We expect this to take time, so we don't await the result immediately in the loop
        // BUT axios.post awaits the response. Ideally we want to fire and forget for the load test,
        // but we need to see the result.
        const response = await axios.post(`${BASE_URL}/upload-image`, formData, {
            headers: {
                ...formData.getHeaders()
            },
            timeout: 60000 // Long timeout as some might queue
        });

        const duration = Date.now() - startTime;
        console.log(`[Req ${id}] ✅ Completed in ${duration}ms. Answer: ${response.data.answer}`);
    } catch (error) {
        console.log(`[Req ${id}] ❌ Failed: ${error.message} ${error.response ? JSON.stringify(error.response.data) : ''}`);
    }
}

async function runLoadTest() {
    console.log(`Starting Load Test: ${TOTAL_REQUESTS} requests in ~${TEST_DURATION_MS}ms`);

    const promises = [];
    for (let i = 1; i <= TOTAL_REQUESTS; i++) {
        // Stagger them slightly
        setTimeout(() => {
            promises.push(sendRequest(i));
        }, (i / TOTAL_REQUESTS) * TEST_DURATION_MS);
    }

    // Wait for all (in a real scenario we wouldn't await the push, but here we want to keep script alive)
    // Actually the promises array won't be populated by the time we wait.
    // Let's just wait a set time.

    setTimeout(async () => {
        // Check status
        try {
            const statusRes = await axios.get(`${BASE_URL}/all-requests`);
            console.log("\n--- System Status ---");
            console.log(JSON.stringify(statusRes.data.systemStatus, null, 2));
        } catch (e) {
            console.error("Could not fetch status");
        }
    }, 5000);
}

runLoadTest();
