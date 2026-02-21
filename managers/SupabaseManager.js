const { createClient } = require('@supabase/supabase-js');

class SupabaseManager {
    constructor() {
        const PROJECT_URL = "https://bhulammdoxhcsmeerhei.supabase.co";
        const SERVICE_KEY = "sb_secret_gm-U24tevxoa9BfY45fQkQ_6PCLM9OT";

        this.supabase = createClient(PROJECT_URL, SERVICE_KEY);
        this.enabled = true;
        console.log("☁️ Supabase Manager initialized");
    }

    async upsertDevice(deviceId, autoAnswer) {
        if (!this.enabled) return;
        try {
            // Fix: Check if SupabaseManager is properly handling upserts or if there's a disconnect.
            // The user mentioned "loading from supabase on dashboard page... is fucking bad".
            // This might mean it's slow or failing? Or just that recent data isn't showing?
            // "processes are still processing no iamges of the process" -> indicates image upload/retrieval failure?
            // OR the clear history path issue.
            
            // Re-verified the user issue: "clear history is not working... processes are still processing".
            // I fixed the clear history filtering on the server.
            
            const { error } = await this.supabase
                .from('devices')
                .upsert({
                    id: deviceId,
                    auto_answer: autoAnswer,
                    last_seen: new Date() 
                }, { onConflict: 'id' }); // Explicit onConflict for clarity
                
            if (error) console.error("Supabase upsert error:", error);
        } catch (e) {
             // Suppress annoying connection timeout stacks, just modify one line
             if (e.message && e.message.includes('fetch failed')) {
                 console.warn("⚠️ Supabase Connection Failed (Network/Timeout) - Skipping sync.");
             } else {
                 console.error("Supabase Error:", e);
             }
        }
    }

    async createRequest(reqData) {
        if (!this.enabled) return;
        try {
            const { error } = await this.supabase
                .from('requests')
                .insert({
                    id: reqData.id,
                    device_id: reqData.deviceId,
                    status: reqData.status,
                    image_data: reqData.image || reqData.shortImage, // Save image!
                    mime_type: reqData.mimeType,
                    answer: reqData.answer,
                    created_at: reqData.createdAt
                });

            if (error) console.error("Supabase Req Create Error:", error.message);
        } catch (e) {
            console.error("Supabase Error:", e);
        }
    }

    async updateRequest(reqId, updates) {
        if (!this.enabled) return;
        try {
            const { error } = await this.supabase
                .from('requests')
                .update({
                    status: updates.status,
                    answer: updates.answer,
                    updated_at: new Date()
                })
                .eq('id', reqId);

            if (error) console.error("Supabase Req Update Error:", error.message);
        } catch (e) {
            console.error("Supabase Error:", e);
        }
    }
    // === API KEYS ===
    async getApiKeys() {
        if (!this.enabled) return [];
        try {
            const { data, error } = await this.supabase
                .from('api_keys')
                .select('*')
                .order('created_at', { ascending: true });

            if (error) {
                console.error("Supabase Keys Error:", error.message);
                return [];
            }
            return data;
        } catch (e) {
            console.error("Supabase Error:", e);
            return [];
        }
    }

    async addApiKey(key) {
        if (!this.enabled) return;
        try {
            const { error } = await this.supabase
                .from('api_keys')
                .insert({ key: key, tier_usage: {} }); // minimal schema
            if (error) console.error("Supabase Add Key Error:", error.message);
        } catch (e) {
            console.error("Supabase Error:", e);
        }
    }

    async deleteApiKey(keyId) {
        if (!this.enabled) return;
        try {
            const { error } = await this.supabase
                .from('api_keys')
                .delete()
                .eq('id', keyId);
            if (error) console.error("Supabase Delete Key Error:", error.message);
        } catch (e) {
            console.error("Supabase Error:", e);
        }
    }
}

module.exports = SupabaseManager;
