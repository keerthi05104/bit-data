import { supabaseAuth } from './supabase.js';

export async function requireUser(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!token) return res.status(401).json({ error: 'Sign in to access your library.' });
    const { data, error } = await supabaseAuth.auth.getUser(token);
    if (error || !data?.user) return res.status(401).json({ error: 'Your session is invalid or expired. Please sign in again.' });
    req.user = data.user;
    next();
  } catch (error) {
    next(error);
  }
}
