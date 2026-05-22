-- Sample PostgreSQL queries for the `users` table used by controllers/usersController.js
-- Run schema first: see sql/users_schema.sql

-- List users (newest first)
-- SELECT id, email, full_name, created_at, updated_at FROM users ORDER BY created_at DESC LIMIT 100;

-- Get one user by id
-- SELECT id, email, full_name, created_at, updated_at FROM users WHERE id = '00000000-0000-4000-8000-000000000001'::uuid;

-- Insert
-- INSERT INTO users (email, full_name) VALUES ('user@example.com', 'Sample User')
-- RETURNING id, email, full_name, created_at, updated_at;

-- Update
-- UPDATE users SET email = 'new@example.com', full_name = 'Updated', updated_at = now()
-- WHERE id = '00000000-0000-4000-8000-000000000001'::uuid
-- RETURNING id, email, full_name, created_at, updated_at;

-- Delete
-- DELETE FROM users WHERE id = '00000000-0000-4000-8000-000000000001'::uuid RETURNING id;
