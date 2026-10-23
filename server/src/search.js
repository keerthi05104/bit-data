const CATEGORY_TERMS = {
  identity: ['aadhaar', 'aadhar', 'passport', 'identity', 'id card', 'college id', 'driving licence', 'driver license', 'voter'],
  receipt: ['receipt', 'invoice', 'bill', 'payment', 'fees', 'fee receipt', 'transaction'],
  education: ['marks card', 'marksheet', 'semester', 'result', 'college', 'admission', 'certificate', 'assignment', 'project report'],
  travel: ['ticket', 'train', 'flight', 'boarding pass', 'booking', 'travel'],
  image: ['photo', 'image', 'picture', 'screenshot', 'gallery'],
  document: ['pdf', 'document', 'file', 'report', 'form'],
};

const STOP_WORDS = new Set(['the','a','an','my','me','i','need','find','search','for','please','show','get','from','that','which','when','where','was','is','it','of','and','in','on','to','saved','downloaded','file','document','thing','one']);

function normalize(s='') {
  return s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9\s.-]/g, ' ').replace(/\s+/g, ' ').trim();
}
function extractDateHint(query) {
  const q = normalize(query);
  const now = new Date();
  if (q.includes('today')) return { from: new Date(now.getFullYear(),now.getMonth(),now.getDate()), label:'uploaded today' };
  if (q.includes('yesterday')) { const d=new Date(now); d.setDate(d.getDate()-1); d.setHours(0,0,0,0); const end=new Date(d); end.setDate(end.getDate()+1); return {from:d,to:end,label:'uploaded yesterday'}; }
  if (q.includes('last month')) { const from=new Date(now.getFullYear(),now.getMonth()-1,1); const to=new Date(now.getFullYear(),now.getMonth(),1); return {from,to,label:'uploaded last month'}; }
  if (q.includes('this month')) return {from:new Date(now.getFullYear(),now.getMonth(),1),label:'uploaded this month'};
  if (q.includes('last week')) { const from=new Date(now); from.setDate(from.getDate()-7); return {from,label:'uploaded in the last week'}; }
  if (q.includes('recent') || q.includes('recently')) { const from=new Date(now); from.setDate(from.getDate()-30); return {from,label:'recently uploaded'}; }
  return null;
}
function inferCategory(q) {
  for (const [category, terms] of Object.entries(CATEGORY_TERMS)) {
    if (terms.some(term => q.includes(term))) return category;
  }
  return null;
}
function keywords(q) {
  return normalize(q).split(' ').filter(w => w.length > 1 && !STOP_WORDS.has(w) && !['last','month','week','today','yesterday','recently','college'].includes(w));
}
function haystack(file) {
  return normalize([file.name, file.category, ...(file.tags||[]), file.mimeType, file.notes||''].join(' '));
}

export function parseMemoryQuery(raw) {
  const q = normalize(raw);
  const category = inferCategory(q);
  const dateHint = extractDateHint(q);
  return { raw, normalized:q, category, dateHint, keywords:keywords(q) };
}

export function rankFiles(files, rawQuery) {
  const parsed = parseMemoryQuery(rawQuery);
  const ranked = [];
  for (const file of files) {
    const text = haystack(file);
    let score = 0;
    let matchedContent = false;
    const reasons = [];
    const name = normalize(file.name);
    for (const word of parsed.keywords) {
      if (name.includes(word)) { matchedContent = true; score += 5; if (!reasons.includes('Filename matches your description')) reasons.push('Filename matches your description'); }
      if ((file.tags||[]).some(tag=>normalize(tag).includes(word))) { matchedContent = true; score += 4; if (!reasons.includes('Matches a saved tag')) reasons.push('Matches a saved tag'); }
      if (normalize(file.category||'').includes(word)) { matchedContent = true; score += 2; if (!reasons.includes('Matches its category')) reasons.push('Matches its category'); }
      if (text.includes(word) && !name.includes(word) && !(file.tags||[]).some(tag=>normalize(tag).includes(word))) { matchedContent = true; score += 1; if (!reasons.includes('Matches file details')) reasons.push('Matches file details'); }
    }
    if (parsed.category) {
      const categoryMatch = normalize(file.category||'').includes(parsed.category) ||
        (parsed.category==='identity' && /aadhaar|aadhar|passport|identity|id card|voter|licen[cs]e/.test(text)) ||
        (parsed.category==='receipt' && /receipt|invoice|bill|payment|fee/.test(text)) ||
        (parsed.category==='education' && /college|semester|marks|result|admission|certificate/.test(text)) ||
        (parsed.category==='travel' && /ticket|flight|train|boarding|travel/.test(text)) ||
        (parsed.category==='image' && (file.mimeType||'').startsWith('image/')) ||
        (parsed.category==='document' && (/pdf|document|text/.test(file.mimeType||'') || /\.(pdf|docx?|txt)$/.test(name)));
      if (categoryMatch) { matchedContent = true; score += 4; reasons.push(`Matches ${parsed.category} files`); }
    }
    if (parsed.dateHint) {
      const date = new Date(file.createdAt);
      const match = (!parsed.dateHint.from || date >= parsed.dateHint.from) && (!parsed.dateHint.to || date < parsed.dateHint.to);
      if (match) { score += 3; reasons.push(parsed.dateHint.label); }
      else score -= 3;
    }
    const dateOnlyQuery = parsed.keywords.length === 0 && !parsed.category && parsed.dateHint;
    if ((matchedContent || dateOnlyQuery) && score > 0) ranked.push({ file, score, reasons });
  }
  ranked.sort((a,b)=>b.score-a.score || new Date(b.file.createdAt)-new Date(a.file.createdAt));
  const clarification = !ranked.length
    ? 'I could not find a clear match. Can you remember the file type, what it was for, or approximately when you saved it?'
    : null;
  const suggestions = /\bid\b/.test(parsed.normalized)
    ? ['My college ID','My government ID']
    : parsed.normalized.includes('receipt') ? ['The fee receipt','A shopping receipt'] : [];
  return {
    query: parsed.raw,
    results: ranked.slice(0,100).map(x=>x.file),
    matchReasons: Object.fromEntries(ranked.slice(0,100).map(x=>[String(x.file._id),x.reasons])),
    summary: parsed.category ? `Searched ${parsed.category} clues` : 'Ranked by filename and saved details',
    clarification: clarification || (ranked.length > 0 && ranked[0].score === ranked[ranked.length-1].score && ranked.length > 1 ? 'Several files look similar. Try adding a type or approximate date.' : null),
    suggestions,
  };
}
