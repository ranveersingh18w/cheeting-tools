-- 1. Create the Users table
CREATE TABLE users (
  id bigint generated always as identity primary key,
  username text unique not null,
  password_hash text not null, -- Store plain text or hash here
  points integer default 10,
  is_admin boolean default false,
  created_at timestamptz default now()
);

-- 2. Modify the existing requests table or recreate it
-- Note: You might want to drop the old requests table if you don't need the data
-- DROP TABLE IF EXISTS requests;

CREATE TABLE IF NOT EXISTS requests (
  id text primary key, -- Use text to match the server's req_ timestamp format, or alter server.js to use bigserial
  user_id bigint references users(id),
  device_id text, -- Keeping device_id for legacy extension support
  request_text text,
  image_data text,
  mime_type text,
  answer text,
  status text default 'success',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Note: The original server.js generated request IDs as strings (e.g., 'req_12345'). 
-- I set id as text so it doesn't break the existing code! 
