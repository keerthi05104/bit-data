import { supabaseAdmin } from './supabase.js';

// Supabase PostgreSQL is the metadata database. File bytes remain in Supabase Storage.
export async function connectDatabase() {
  const { error } = await supabaseAdmin.from('files').select('id').limit(1);
  if (error) {
    throw new Error(`Could not access Supabase 'files' table. Run server/sql/schema.sql in the Supabase SQL Editor. Details: ${error.message}`);
  }
  console.log('Supabase PostgreSQL connected (files table accessible)');
}
