# Supabase setup (LLM survey + secure Data API)

## Security model (current repo)

- **`public.users` removed** — identities live in **`auth.users`** (Supabase Auth). Express `/api/auth/register` and `/api/auth/login` call Supabase Auth, then set the existing **JWT cookie** for your HTML pages.
- **RLS is enabled** on `companies`, `respondents`, `surveys`, `questions`, `responses`, and `submissions`.
- **Anonymous (`anon`)** has **no** DML on those tables. Only the **`authenticated`** JWT role can use the Data API, matching the Dashboard message: tables are **not** “unrestricted”.
- **`submissions`**: each row has **`user_id`** (defaults to **`auth.uid()`**). Policies allow **only the row owner** to read/write/delete.
- **`public/index.html`**: saving after **Generate** requires a **Supabase session** in the browser (`supabase.auth.getSession()`). If there is no session, the app still generates HTML and shows a short notice instead of inserting.

## 1. Apply schema + RLS on an existing project

In Supabase → **SQL** → **New query**, run **`database/migration_secure_rls_drop_public_users.sql`** once.

Then either:

- run **`npm run db:init`** (uses `DATABASE_URL`), or  
- for new empty projects, rely on **`database/init.sql`** via Express startup.

## 2. Submissions-only (smaller script)

If you only need the **`submissions`** table aligned with the secure model, run **`database/supabase_submissions.sql`**.

## 3. API keys

Dashboard → **Project Settings** → **API**: project URL (no `/rest/v1` suffix) and **anon** key in `connection.env`:

```env
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIs...
JWT_SECRET=at-least-16-random-characters-here
```

Restart **`npm run server`** or **`npm run dev`**. The survey page loads anon config from **`GET /api/public/supabase-config`** (Express and Next both implement it).

### 3b. `GET /api/public/supabase-config` returns 404

Use the same host/port as Node, or set `<meta name="app-api-base" content="http://127.0.0.1:3000">` in `public/index.html` when the HTML is served from Apache. See comments in that file.

## 4. Inserts fail with RLS / JWT errors

- **Sign in** in the browser with Supabase Auth (same project) so PostgREST sends an **`Authorization: Bearer <access_token>`** header. The bundled client uses **`persistSession: true`**.
- Confirm **`database/migration_secure_rls_drop_public_users.sql`** (or `init.sql` tail) ran so policies and **`REVOKE … FROM anon`** exist.

## 5. Data API exposure

Ensure **`public`** (and these tables) stay exposed to the Data API in project settings. RLS still applies; `anon` no longer bypasses it.

## 6. Verify

1. Register/login via **`/api/auth/register`** and **`/api/auth/login`** (or Supabase Auth UI) so **`auth.users`** has a row.
2. Open the survey with a **Supabase session** in the same browser profile (implement sign-in UI or use Auth helpers).
3. **Generate** — a row should appear in **`public.submissions`** with **`user_id`** set.

## 7. Production notes

- Narrow **`companies` / `surveys` / …** policies from “any authenticated user” to tenant rules (`company_id`, membership tables, etc.) when you add them.
- Never expose **`service_role`** in the browser; it bypasses RLS.
