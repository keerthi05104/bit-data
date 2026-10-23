import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import multer from 'multer';
import { connectDatabase } from './db.js';
import { requireUser } from './auth.js';
import { supabaseAdmin, bucketName } from './supabase.js';
import { rankFiles } from './search.js';

const app = express();
const port = Number(process.env.PORT || 5000);
const maxBytes = Number(process.env.MAX_FILE_SIZE_MB || 100) * 1024 * 1024;
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: maxBytes, files: 1 } });
const FILES_TABLE = 'files';

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin: (process.env.CLIENT_ORIGIN || 'http://localhost:5173').split(',').map(s => s.trim()), credentials: false }));
app.use(express.json({ limit: '1mb' }));
app.get('/api/health', (_req, res) => res.json({ success: true, app: 'bit data API' }));

// Convert Supabase's snake_case row to the existing frontend's camelCase shape.
function fromRow(row) {
  if (!row) return null;
  return {
    _id: String(row.id),
    ownerId: row.user_id,
    storagePath: row.storage_path,
    name: row.name,
    originalName: row.original_name,
    mimeType: row.mime_type,
    size: Number(row.size_bytes || 0),
    category: row.category || 'other',
    tags: row.tags || [],
    notes: row.notes || '',
    favorite: Boolean(row.is_favorite),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    previewUrl: null,
  };
}
function toRow(file) {
  return {
    user_id: file.ownerId,
    storage_path: file.storagePath,
    name: file.name,
    original_name: file.originalName,
    mime_type: file.mimeType,
    size_bytes: file.size,
    category: file.category,
    tags: file.tags || [],
    notes: file.notes || '',
    is_favorite: Boolean(file.favorite),
    created_at: file.createdAt,
    updated_at: file.updatedAt,
  };
}
function safeFile(file) {
  if (!file) return null;
  const { storagePath, ownerId, ...rest } = file;
  return { ...rest, _id: String(file._id), previewUrl: file.previewUrl || null };
}
async function makePreview(file) {
  if (!(file.mimeType || '').startsWith('image/')) return file;
  const { data, error } = await supabaseAdmin.storage.from(bucketName).createSignedUrl(file.storagePath, 60 * 10);
  if (error) return file;
  return { ...file, previewUrl: data.signedUrl };
}
function cleanName(name = '') {
  const cleaned = name.replace(/[\\/\0-\x1f]/g, '_').replace(/\.\./g, '_').trim().slice(0, 180);
  return cleaned || 'unnamed-file';
}
function inferCategory(name = '', mime = '') {
  const text = `${name} ${mime}`.toLowerCase();
  if (/aadhaar|aadhar|passport|identity|college.?id|voter|licen[cs]e/.test(text)) return 'identity';
  if (/receipt|invoice|bill|fee|payment/.test(text)) return 'receipt';
  if (/marks|semester|result|college|admission|certificate|assignment/.test(text)) return 'education';
  if (/ticket|flight|train|boarding|travel/.test(text)) return 'travel';
  if (mime.startsWith('image/')) return 'image';
  if (mime.includes('pdf') || /\.(pdf|docx?|txt|xlsx?|pptx?)$/i.test(name)) return 'document';
  return 'other';
}
function validId(id) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id || '');
}
function sendError(next, error) { next(error); }

app.get('/api/me', requireUser, (req, res) => res.json({ user: { id: req.user.id, email: req.user.email } }));

app.get('/api/files', requireUser, async (req, res, next) => {
  try {
    const { data, error } = await supabaseAdmin.from(FILES_TABLE).select('*').eq('user_id', req.user.id).order('created_at', { ascending: false }).limit(500);
    if (error) throw error;
    const files = (data || []).map(fromRow);
    const enriched = await Promise.all(files.map(makePreview));
    const bytes = files.reduce((sum, f) => sum + (f.size || 0), 0);
    res.json({ files: enriched.map(safeFile), stats: { count: files.length, bytes } });
  } catch (e) { next(e); }
});

app.post('/api/files', requireUser, (req, res, next) => {
  upload.single('file')(req, res, async err => {
    if (err) {
      if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: `File exceeds the ${process.env.MAX_FILE_SIZE_MB || 100} MB upload limit.` });
      return res.status(400).json({ error: err.message || 'Upload rejected.' });
    }
    let storagePath;
    try {
      if (!req.file) return res.status(400).json({ error: 'Choose a file to upload.' });
      const name = cleanName(req.file.originalname);
      storagePath = `${req.user.id}/${new Date().toISOString().slice(0, 10)}/${randomUUID()}-${name}`;
      const { error: storageError } = await supabaseAdmin.storage.from(bucketName).upload(storagePath, req.file.buffer, {
        contentType: req.file.mimetype || 'application/octet-stream', upsert: false,
      });
      if (storageError) return res.status(502).json({ error: `Storage upload failed: ${storageError.message}` });
      const now = new Date().toISOString();
      const record = {
        ownerId: req.user.id, storagePath, name, originalName: name,
        mimeType: req.file.mimetype || 'application/octet-stream', size: req.file.size,
        category: inferCategory(name, req.file.mimetype || ''), tags: [], notes: '', favorite: false,
        createdAt: now, updatedAt: now,
      };
      const { data, error: dbError } = await supabaseAdmin.from(FILES_TABLE).insert(toRow(record)).select('*').single();
      if (dbError) {
        await supabaseAdmin.storage.from(bucketName).remove([storagePath]);
        throw dbError;
      }
      res.status(201).json({ file: safeFile(await makePreview(fromRow(data))) });
    } catch (e) { next(e); }
  });
});

app.get('/api/search', requireUser, async (req, res, next) => {
  try {
    const q = String(req.query.q || '').trim().slice(0, 300);
    if (!q) return res.json({ query: q, results: [], matchReasons: {}, summary: 'Enter a description to search.' });
    const { data, error } = await supabaseAdmin.from(FILES_TABLE).select('*').eq('user_id', req.user.id).order('created_at', { ascending: false }).limit(2000);
    if (error) throw error;
    const files = (data || []).map(fromRow);
    const result = rankFiles(files, q);
    result.results = await Promise.all(result.results.map(makePreview));
    result.results = result.results.map(safeFile);
    res.json(result);
  } catch (e) { next(e); }
});

app.post('/api/files/:id/download', requireUser, async (req, res, next) => {
  try {
    if (!validId(req.params.id)) return res.status(400).json({ error: 'Invalid file ID.' });
    const { data: row, error: dbError } = await supabaseAdmin.from(FILES_TABLE).select('*').eq('id', req.params.id).eq('user_id', req.user.id).maybeSingle();
    if (dbError) throw dbError;
    const file = fromRow(row);
    if (!file) return res.status(404).json({ error: 'File not found.' });
    const { data, error } = await supabaseAdmin.storage.from(bucketName).createSignedUrl(file.storagePath, 60 * 5, { download: file.name });
    if (error) return res.status(502).json({ error: 'Could not create a download link.' });
    res.json({ url: data.signedUrl, expiresInSeconds: 300 });
  } catch (e) { next(e); }
});

app.patch('/api/files/:id', requireUser, async (req, res, next) => {
  try {
    if (!validId(req.params.id)) return res.status(400).json({ error: 'Invalid file ID.' });
    const update = { updated_at: new Date().toISOString() };
    if (typeof req.body.favorite === 'boolean') update.is_favorite = req.body.favorite;
    if (typeof req.body.name === 'string') {
      const name = cleanName(req.body.name);
      if (!name) return res.status(400).json({ error: 'Filename is required.' });
      update.name = name;
    }
    if (Array.isArray(req.body.tags)) update.tags = req.body.tags.filter(t => typeof t === 'string').map(t => t.trim().slice(0, 60)).filter(Boolean).slice(0, 30);
    if (typeof req.body.notes === 'string') update.notes = req.body.notes.trim().slice(0, 2000);
    const { data, error } = await supabaseAdmin.from(FILES_TABLE).update(update).eq('id', req.params.id).eq('user_id', req.user.id).select('*').maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'File not found.' });
    res.json({ file: safeFile(await makePreview(fromRow(data))) });
  } catch (e) { next(e); }
});

app.delete('/api/files/:id', requireUser, async (req, res, next) => {
  try {
    if (!validId(req.params.id)) return res.status(400).json({ error: 'Invalid file ID.' });
    const { data: row, error: lookupError } = await supabaseAdmin.from(FILES_TABLE).select('*').eq('id', req.params.id).eq('user_id', req.user.id).maybeSingle();
    if (lookupError) throw lookupError;
    const file = fromRow(row);
    if (!file) return res.status(404).json({ error: 'File not found.' });
    const { error: storageError } = await supabaseAdmin.storage.from(bucketName).remove([file.storagePath]);
    if (storageError) return res.status(502).json({ error: `Could not delete stored file: ${storageError.message}` });
    const { error: deleteError } = await supabaseAdmin.from(FILES_TABLE).delete().eq('id', req.params.id).eq('user_id', req.user.id);
    if (deleteError) throw deleteError;
    res.json({ success: true });
  } catch (e) { next(e); }
});

app.use((err, _req, res, _next) => {
  console.error('API error:', err.message);
  if (res.headersSent) return;
  res.status(500).json({ error: 'Something went wrong while processing your request. Check the server logs for details.' });
});

await connectDatabase();
app.listen(port, () => console.log(`bit data API listening on http://localhost:${port}`));
