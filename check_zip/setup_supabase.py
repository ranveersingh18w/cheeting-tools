import psycopg2
import sys

# Configuration
PROJECT_ID = "bhulammdoxhcsmeerhei"
# Assuming the "secret api" is the DB password. If it's an API Key, this connection will fail 
# but standard API keys cannot create tables easily without an internal RPC function.
DB_PASSWORD = "sb_secret_gm-U24tevxoa9BfY45fQkQ_6PCLM9OT" 
DB_HOST = f"db.{PROJECT_ID}.supabase.co"
DB_PORT = "5432"
DB_NAME = "postgres"
DB_USER = "postgres"

def run_migration():
    print(f"🔌 Connecting to database at {DB_HOST}...")
    
    try:
        conn = psycopg2.connect(
            host=DB_HOST,
            database=DB_NAME,
            user=DB_USER,
            password=DB_PASSWORD,
            port=DB_PORT
        )
        conn.autocommit = True
        cur = conn.cursor()
        print("✅ Connected successfully.")

        # 1. Create Devices Table
        print("🔨 Creating 'devices' table...")
        cur.execute("""
            CREATE TABLE IF NOT EXISTS devices (
                id TEXT PRIMARY KEY,
                auto_answer BOOLEAN DEFAULT FALSE,
                last_seen TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            );
        """)
        
        # 2. Create Requests Table
        print("🔨 Creating 'requests' table...")
        # Note: image_data is TEXT to store base64 as requested "saving images also"
        # In production, using Storage buckets is better, but this matches project logic.
        cur.execute("""
            CREATE TABLE IF NOT EXISTS requests (
                id TEXT PRIMARY KEY,
                device_id TEXT REFERENCES devices(id),
                status TEXT DEFAULT 'pending',
                answer TEXT,
                image_data TEXT, 
                mime_type TEXT,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            );
        """)

        # 3. Enable RLS (Row Level Security) - Optional good practice, defaults to off usually or on depending on project settings
        # We will leave it open for now since we are using backend logic.

        # 4. Optional: Create Storage Bucket for images if we wanted to use Storage instead of DB
        # This requires the 'storage' extension which is usually enabled.
        print("🪣 Checking 'images' storage bucket...")
        try:
            cur.execute("""
                INSERT INTO storage.buckets (id, name, public) 
                VALUES ('images', 'images', true)
                ON CONFLICT (id) DO NOTHING;
            """)
            print("✅ Storage bucket configured.")
        except Exception as e:
            print(f"⚠️ Could not create storage bucket (Schema might differ): {e}")

        print("\n🚀 Database migration completed successfully!")
        
        cur.close()
        conn.close()

    except psycopg2.OperationalError as e:
        print("\n❌ Connection Failed!")
        print(f"Error: {e}")
        print("\nNOTE: The 'Secret API' provided must be the DATABASE PASSWORD for this script to work.")
        print("If 'sb_secret_...' is a Service Role API Key (JWT), you cannot use it to connect via psycopg2 directly.")
        print("In that case, please create the tables manually in the Supabase Dashboard SQL Editor.")

if __name__ == "__main__":
    run_migration()
