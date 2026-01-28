from supabase import create_client, Client
import sys

url = "https://bhulammdoxhcsmeerhei.supabase.co"
key = "sb_secret_gm-U24tevxoa9BfY45fQkQ_6PCLM9OT"

try:
    print(f"Connecting to {url}...")
    supabase: Client = create_client(url, key)
    
    # Try a read (will fail 404 table not found, but 401 Unauthorized is what we check for)
    res = supabase.table("devices").select("*").execute()
    print("Response:", res)
    
except Exception as e:
    print(f"Error: {e}")
