# bit data — Memory-to-File Retrieval

bit data is a full-stack personal file library designed to help you find a file from what you remember about it, not only from its filename.

## Stack
- React + Vite frontend
- Node.js + Express API
- Supabase Auth for email/password authentication and access-token verification
- **Supabase PostgreSQL** for file metadata, categories, tags, dates, favorites, and notes
- **Supabase Storage** for the actual uploaded files, in a private bucket
- Metadata-based memory search with relevance ranking, date clues, categories, and match explanations

MongoDB Atlas is not used in this edition.

## Features
- Sign up and sign in with Supabase Auth
- Upload and browse files
- Grid/list library interface and image previews
- Search by filename, category, saved tags, and approximate upload date
- Search results explain why a file matched and ask for clarification when needed
- Download through short-lived signed URLs
- Rename, favorite, and delete files
- Per-user ownership checks in the API

## Important search limitation
This version searches filenames and saved metadata. It does **not** yet read text inside scanned images or PDFs. Add OCR/document text extraction later if you want queries such as “the address printed on the document” to work when that text is not in the filename or tags.

## Requirements
- Node.js 20 or newer
- A Supabase project

## 1. Configure Supabase
1. In Supabase Dashboard → Storage, create a **private** bucket named `bit data-files` (or change `SUPABASE_BUCKET` in the server environment).
2. In Authentication → Providers, enable Email/password sign-in.
3. In SQL Editor, run the complete script at `server/sql/schema.sql`. This creates the `public.files` metadata table, indexes, and row-level security policies.
4. In Project Settings → API, copy the project URL and API keys. Use the anon/publishable key for the client and the service-role/secret key only on the server.
5. Do not make the storage bucket public. The Express API uploads files and creates short-lived signed links using its server-only key.

## 2. Configure environment variables
Copy these templates:
- `client/.env.example` → `client/.env`
- `server/.env.example` → `server/.env`

Fill in your actual Supabase project values. Never commit real `.env` files. Never put `SUPABASE_SERVICE_ROLE_KEY` in the client or in any variable beginning with `VITE_`.

### `client/.env`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_API_BASE_URL` (defaults to `/api`; local Vite proxy forwards it to Express)

### `server/.env`
- `PORT` (defaults to `5000`)
- `CLIENT_ORIGIN` (defaults to `http://localhost:5173`; set to the deployed frontend origin in production)
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY` (used to validate Supabase Auth sessions)
- `SUPABASE_SERVICE_ROLE_KEY` (server only; or the server-only secret key supported by your project)
- `SUPABASE_BUCKET` (defaults to `bit data-files`)
- `MAX_FILE_SIZE_MB` (defaults to `100`)

The server checks that it can access the `files` table at startup. If it reports that the table is missing, run `server/sql/schema.sql` in Supabase SQL Editor and restart the server.

## 3. Install and run locally
Open two terminals from the project root.

Terminal 1 — backend:
```bash
cd server
npm install
npm run dev
```

Terminal 2 — frontend:
```bash
cd client
npm install
npm run dev
```

Open the Vite URL shown in the terminal, usually `http://localhost:5173`.

## 4. Deployment
Deploy the client and API as separate services unless your hosting setup explicitly supports both in one deployment. Set the client environment variables on the frontend host and the server environment variables on the backend host. Set `CLIENT_ORIGIN` to the exact deployed frontend origin. Run the SQL schema once in the target Supabase project and create the private Storage bucket before testing uploads.

## Security notes
- Keep the bucket private and the service-role/secret key server-side only.
- The API derives the user identity from a verified Supabase Auth token; it does not trust a browser-supplied owner ID.
- The backend filters every metadata operation by the authenticated `user_id`.
- RLS is enabled on the metadata table as defense in depth.
- Before production, add rate limits, quotas, malware scanning appropriate to your use case, and operational monitoring. This starter is not a security audit.

## Example searches
- `my college ID`
- `the receipt from last month`
- `the PDF with semester results`
- `the screenshot I saved yesterday`

Search uses words, recognized categories, and date hints to rank metadata matches. An ambiguous query such as `my ID` can prompt you to clarify whether you mean a college ID or a government ID.
