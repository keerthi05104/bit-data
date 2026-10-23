import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDownToLine, ArrowRight, ArrowUpRight, Check, ChevronDown, CircleHelp,
  Cloud, Command, FileImage, FileText, Filter, FolderClosed, Grid2X2, HardDrive,
  Heart, Image, LayoutGrid, List, LoaderCircle, LogOut, Menu, MoreHorizontal,
  Plus, Search, Settings2, ShieldCheck, SlidersHorizontal, Sparkles, Star,
  UploadCloud, X, Clock3, File, Trash2, Pencil, RefreshCw
} from 'lucide-react';
import AuthScreen from './components/AuthScreen.jsx';
import { fileIcon, formatBytes, formatDate } from './components/FileIcon.jsx';
import { supabase } from './lib/supabase.js';
import { apiRequest } from './lib/api.js';

const categories = [
  { label:'All files', value:'all', icon:FolderClosed },
  { label:'Images', value:'image', icon:Image },
  { label:'Documents', value:'document', icon:FileText },
  { label:'Favorites', value:'favorites', icon:Heart },
];
const sampleIdeas = ['My college ID','The receipt from last month','My semester results PDF'];

function initials(email='') { return email.slice(0,1).toUpperCase() || 'U'; }

export default function App() {
  const [session, setSession] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');
  const [view, setView] = useState('grid');
  const [sort, setSort] = useState('recent');
  const [searchInfo, setSearchInfo] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [notice, setNotice] = useState('');
  const [busyId, setBusyId] = useState('');
  const [menuId, setMenuId] = useState('');
  const [showUpload, setShowUpload] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const [storageStats, setStorageStats] = useState({ count:0, bytes:0 });
  const inputRef = useRef(null);
  const searchTimer = useRef(null);
  const [pendingFiles, setPendingFiles] = useState([]);

  const configured = Boolean(supabase);

  useEffect(() => {
    if (!supabase) { setAuthReady(true); return; }
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setAuthReady(true); });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);

  const token = session?.access_token;

  const loadFiles = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const result = await apiRequest('/files', token);
      setFiles(result.files || []);
      setStorageStats(result.stats || {count:0,bytes:0});
    } catch (e) { setNotice(e.message); }
    finally { setLoading(false); }
  }, [token]);

  useEffect(() => { loadFiles(); }, [loadFiles]);

  const filteredFiles = useMemo(() => {
    let list = [...files];
    if (activeCategory === 'image') list = list.filter(f => (f.mimeType||'').startsWith('image/'));
    if (activeCategory === 'document') list = list.filter(f => /pdf|document|text|word|spreadsheet|presentation/i.test(f.mimeType||'') || /\.(pdf|docx?|txt|xlsx?|pptx?)$/i.test(f.name));
    if (activeCategory === 'favorites') list = list.filter(f => f.favorite);
    if (sort === 'name') list.sort((a,b)=>a.name.localeCompare(b.name));
    if (sort === 'oldest') list.sort((a,b)=>new Date(a.createdAt)-new Date(b.createdAt));
    if (sort === 'largest') list.sort((a,b)=>(b.size||0)-(a.size||0));
    return list;
  }, [files, activeCategory, sort]);

  async function authenticate(mode, email, password) {
    if (!supabase) throw new Error('Supabase is not configured. Fill in client/.env and restart Vite.');
    const result = mode === 'signup'
      ? await supabase.auth.signUp({ email, password })
      : await supabase.auth.signInWithPassword({ email, password });
    if (result.error) throw result.error;
    if (mode === 'signup' && !result.data.session) {
      throw new Error('Account created. Check your email to verify it, then sign in.');
    }
  }


function handleUpload(fileList) {
  const picked = Array.from(fileList || []);
  if (!picked.length || !token) return;

  setPendingFiles(prev => [
    ...prev,
    ...picked.map(file => ({
      file,
      name: file.name,
      id: `${file.name}-${file.size}-${file.lastModified}-${Math.random()}`
    }))
  ]);

  setShowUpload(true);
  setNotice('');

  if (inputRef.current) {
    inputRef.current.value = '';
  }
}


  async function searchFiles(nextQuery = query) {
    if (!token) return;
    if (!nextQuery.trim()) { setSearchInfo(null); return; }
    setLoading(true);
    try {
      const result = await apiRequest(`/search?q=${encodeURIComponent(nextQuery.trim())}`, token);
      setSearchInfo(result);
      setActiveCategory('all');
    } catch (e) { setNotice(e.message); }
    finally { setLoading(false); }
  }

  useEffect(() => {
    if (!token || !query.trim()) { setSearchInfo(null); return; }
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => searchFiles(query), 300);
    return () => clearTimeout(searchTimer.current);
  // searchFiles is intentionally invoked after a short debounce for interactive search.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, token]);

  async function downloadFile(file) {
    setBusyId(file._id);
    try {
      const result = await apiRequest(`/files/${file._id}/download`, token, { method:'POST' });
      window.open(result.url, '_blank', 'noopener,noreferrer');
    } catch (e) { setNotice(e.message); }
    finally { setBusyId(''); }
  }

  async function toggleFavorite(file) {
    setBusyId(file._id);
    try {
      const result = await apiRequest(`/files/${file._id}`, token, { method:'PATCH', body:JSON.stringify({favorite:!file.favorite}) });
      setFiles(prev=>prev.map(f=>f._id===file._id?result.file:f));
    } catch (e) { setNotice(e.message); }
    finally { setBusyId(''); setMenuId(''); }
  }

  async function renameFile(file) {
    const name = window.prompt('Enter a new filename', file.name);
    if (!name || name.trim()===file.name) return;
    setBusyId(file._id);
    try {
      const result = await apiRequest(`/files/${file._id}`, token, { method:'PATCH', body:JSON.stringify({name:name.trim()}) });
      setFiles(prev=>prev.map(f=>f._id===file._id?result.file:f));
      setNotice('Filename updated.');
    } catch (e) { setNotice(e.message); }
    finally { setBusyId(''); setMenuId(''); }
  }

  async function deleteFile(file) {
    if (!window.confirm(`Delete "${file.name}" permanently?`)) return;
    setBusyId(file._id);
    try {
      await apiRequest(`/files/${file._id}`, token, { method:'DELETE' });
      setFiles(prev=>prev.filter(f=>f._id!==file._id));
      if (selectedFile?._id===file._id) setSelectedFile(null);
      setNotice('File deleted.');
      await loadFiles();
    } catch (e) { setNotice(e.message); }
    finally { setBusyId(''); setMenuId(''); }
  }

  if (!authReady) return <div className="boot-screen"><LoaderCircle className="spin" size={26}/><span>Opening your library…</span></div>;
  if (!session) return <AuthScreen onAuth={authenticate} configured={configured}/>;

  const results = searchInfo ? searchInfo.results || [] : filteredFiles;
  const heading = searchInfo ? `Results for “${searchInfo.query}”` : categories.find(c=>c.value===activeCategory)?.label || 'All files';
  const totalBytes = storageStats.bytes || 0;

  return <div className="app-shell">
    <aside className={`sidebar ${mobileNav?'mobile-open':''}`}>
      <div className="brand-row"><div className="brand-mark"><Cloud size={19}/></div><span>bit data<span className="brand-period">.</span></span><button className="icon-button mobile-close" onClick={()=>setMobileNav(false)}><X size={18}/></button></div>
      <button className="button upload-main" onClick={()=>inputRef.current?.click()}><Plus size={18}/> Add files <span className="shortcut">⌘U</span></button>
      <div className="nav-label">LIBRARY</div>
      <nav className="side-nav">
        {categories.map(item=><button key={item.value} className={`nav-item ${activeCategory===item.value&&!searchInfo?'active':''}`} onClick={()=>{setActiveCategory(item.value);setSearchInfo(null);setQuery('');setMobileNav(false)}}><item.icon size={18}/><span>{item.label}</span>{item.value==='all'&&<span className="nav-count">{files.length}</span>}</button>)}
      </nav>
      <div className="sidebar-rule"/>
      <div className="nav-label">YOUR SPACE</div>
      <div className="storage-card">
        <div className="storage-icon"><HardDrive size={17}/></div>
        <div className="storage-copy"><strong>Personal storage</strong><span>{formatBytes(totalBytes)} used</span></div>
        <div className="storage-track"><span style={{width:`${Math.min(totalBytes/(1024*1024*1024)*100,100)}%`}}/></div>
        <small>{files.length} {files.length===1?'file':'files'} in your library</small>
      </div>
      <div className="sidebar-bottom">
        <div className="privacy-note"><ShieldCheck size={16}/><span>Your files are private<br/>to your account.</span></div>
        <button className="profile-row" onClick={()=>supabase?.auth.signOut()}><div className="avatar">{initials(session.user.email)}</div><div className="profile-copy"><strong>{session.user.email}</strong><span>Personal account</span></div><LogOut size={16}/></button>
      </div>
    </aside>

    <main className="main-panel">
      <header className="topbar">
        <button className="icon-button mobile-menu" onClick={()=>setMobileNav(true)}><Menu size={20}/></button>
        <div className="breadcrumb">Your space <span>/</span> <strong>{searchInfo?'Search':categories.find(c=>c.value===activeCategory)?.label || 'All files'}</strong></div>
        <div className="topbar-right"><span className="secure-pill"><span/> Private library</span><button className="avatar small-avatar" title={session.user.email}>{initials(session.user.email)}</button></div>
      </header>

      <div className="content-wrap">
        <section className="welcome-row">
          <div><div className="eyebrow">YOUR PERSONAL LIBRARY</div><h1>{searchInfo?'Your search, narrowed down.':'Everything you keep, easier to find.'}</h1><p>Search by what you remember — not just what you named it.</p></div>
          <button className="button primary desktop-upload" onClick={()=>inputRef.current?.click()}><UploadCloud size={17}/> Upload files</button>
        </section>

        <section className="memory-search">
          <div className="search-head"><div className="search-symbol"><Sparkles size={18}/></div><div><strong>Find it from memory</strong><p>Describe the file, the moment, or what it was for.</p></div><span className="beta-pill">SMART SEARCH</span></div>
          <form className="search-form" onSubmit={e=>{e.preventDefault();searchFiles(query)}}><Search size={20}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="e.g. the receipt from when I paid my college fees" aria-label="Search by memory"/>{query&&<button type="button" className="clear-search" onClick={()=>{setQuery('');setSearchInfo(null)}} aria-label="Clear search"><X size={17}/></button>}<button className="search-submit" type="submit"><span>Find file</span><ArrowRight size={17}/></button></form>
          {!query && <div className="suggestion-row"><span>Try:</span>{sampleIdeas.map(idea=><button key={idea} onClick={()=>{setQuery(idea);searchFiles(idea)}}>{idea}</button>)}</div>}
          {searchInfo?.clarification && <div className="clarification"><CircleHelp size={17}/><div><strong>One quick question</strong><p>{searchInfo.clarification}</p>{searchInfo.suggestions?.map(s=><button key={s} onClick={()=>{setQuery(s);searchFiles(s)}}>{s}</button>)}</div></div>}
        </section>

        {notice && <div className="toast" role="status"><Check size={16}/><span>{notice}</span><button onClick={()=>setNotice('')}><X size={15}/></button></div>}

        <section className="library-section">
          <div className="section-title-row"><div><h2>{heading}</h2><p>{searchInfo ? `${results.length} matching ${results.length===1?'file':'files'}${searchInfo.summary?` · ${searchInfo.summary}`:''}` : activeCategory==='all'?'Your saved files, all in one place':`${results.length} ${results.length===1?'item':'items'}`}</p></div><div className="library-actions"><label className="sort-control"><SlidersHorizontal size={16}/><select value={sort} onChange={e=>setSort(e.target.value)} aria-label="Sort files"><option value="recent">Most recent</option><option value="oldest">Oldest first</option><option value="name">Name A–Z</option><option value="largest">Largest first</option></select><ChevronDown size={14}/></label><div className="view-switch"><button className={view==='grid'?'selected':''} onClick={()=>setView('grid')} aria-label="Grid view"><Grid2X2 size={17}/></button><button className={view==='list'?'selected':''} onClick={()=>setView('list')} aria-label="List view"><List size={17}/></button></div></div></div>

          {loading && <div className="loading-line"><LoaderCircle className="spin" size={17}/> Finding your files…</div>}
          {!loading && results.length===0 ? <div className="empty-state"><div className="empty-art"><Search size={28}/></div><h3>{searchInfo?'Nothing matched this memory yet.':'Your library is ready for its first file.'}</h3><p>{searchInfo?'Try a different phrase, a category, or part of the filename.':'Add a few files to start building a library you can search naturally.'}</p>{searchInfo?<button className="button secondary" onClick={()=>{setQuery('');setSearchInfo(null)}}>Clear search</button>:<button className="button primary" onClick={()=>inputRef.current?.click()}><Plus size={17}/> Add your first file</button>}</div>
          : <div className={view==='grid'?'file-grid':'file-list'}>
            {results.map(file=>{
              const Icon=fileIcon(file.mimeType,file.name);
              const isImage=(file.mimeType||'').startsWith('image/');
              return <article className={`file-card ${view==='list'?'list-card':''}`} key={file._id} onClick={()=>setSelectedFile(file)}>
                <div className={`file-preview ${isImage?'image-preview':''}`}>
                  {isImage && file.previewUrl ? <img src={file.previewUrl} alt="" loading="lazy"/> : <div className="file-type-icon"><Icon size={27}/><span>{(file.name.split('.').pop()||'FILE').slice(0,4).toUpperCase()}</span></div>}
                  <button className={`favorite-button ${file.favorite?'is-favorite':''}`} onClick={e=>{e.stopPropagation();toggleFavorite(file)}} title={file.favorite?'Remove favorite':'Add favorite'}><Star size={16} fill={file.favorite?'currentColor':'none'}/></button>
                  <button className="more-button" onClick={e=>{e.stopPropagation();setMenuId(menuId===file._id?'':file._id)}} aria-label="File actions"><MoreHorizontal size={18}/></button>
                  {menuId===file._id&&<div className="file-menu" onClick={e=>e.stopPropagation()}><button onClick={()=>downloadFile(file)}><ArrowDownToLine size={15}/> Download</button><button onClick={()=>renameFile(file)}><Pencil size={15}/> Rename</button><button onClick={()=>deleteFile(file)} className="danger"><Trash2 size={15}/> Delete</button></div>}
                </div>
                <div className="file-card-body"><strong title={file.name}>{file.name}</strong><span>{formatBytes(file.size)} <i/> {formatDate(file.createdAt)}</span>{searchInfo?.matchReasons?.[file._id]?.length>0&&<div className="match-reasons"><Sparkles size={12}/>{searchInfo.matchReasons[file._id][0]}</div>}</div>
                <button className="card-download" onClick={e=>{e.stopPropagation();downloadFile(file)}} disabled={busyId===file._id} aria-label={`Download ${file.name}`}>{busyId===file._id?<LoaderCircle className="spin" size={16}/>:<ArrowDownToLine size={16}/>}</button>
              </article>;
            })}
          </div>}
        </section>
        <footer className="page-footer"><span>bit data<span className="brand-period">.</span></span><span>Made for the files you need to find.</span><button onClick={loadFiles}><RefreshCw size={13}/> Refresh library</button></footer>
      </div>
    </main>

    <input ref={inputRef} type="file" multiple hidden onChange={e=>handleUpload(e.target.files)}/>
    {showUpload && <div className="modal-backdrop" onClick={()=>!uploading&&setShowUpload(false)}><section className="upload-modal" onClick={e=>e.stopPropagation()}><div className="modal-heading"><div><h3>Add to your library</h3><p>Files are uploaded to your private storage.</p></div><button className="icon-button" disabled={uploading} onClick={()=>setShowUpload(false)}><X size={18}/></button></div><div className="upload-drop" onClick={()=>!uploading&&inputRef.current?.click()}><div className="upload-orb"><UploadCloud size={25}/></div><strong>{uploading?'Adding your files…':'Choose files to upload'}</strong><p>{uploadProgress||'Select one or more files from your device.'}</p>{uploading&&<LoaderCircle className="spin" size={20}/>}</div><div className="modal-bottom"><span><ShieldCheck size={15}/> Private by default</span><button className="button secondary" disabled={uploading} onClick={()=>setShowUpload(false)}>Done</button></div></section></div>}
    {selectedFile && <div className="modal-backdrop" onClick={()=>setSelectedFile(null)}><section className="detail-modal" onClick={e=>e.stopPropagation()}><div className="modal-heading"><div><div className="eyebrow">FILE DETAILS</div><h3>{selectedFile.name}</h3></div><button className="icon-button" onClick={()=>setSelectedFile(null)}><X size={18}/></button></div>{(selectedFile.mimeType||'').startsWith('image/')&&selectedFile.previewUrl?<img className="detail-image" src={selectedFile.previewUrl} alt={selectedFile.name}/>:<div className="detail-file-art">{(()=>{const I=fileIcon(selectedFile.mimeType,selectedFile.name);return <I size={42}/>})()}</div>}<div className="detail-meta"><div><span>File size</span><strong>{formatBytes(selectedFile.size)}</strong></div><div><span>Added</span><strong>{formatDate(selectedFile.createdAt)}</strong></div><div><span>File type</span><strong>{selectedFile.mimeType||'Unknown'}</strong></div><div><span>Category</span><strong>{selectedFile.category||'Uncategorized'}</strong></div></div>{selectedFile.tags?.length>0&&<div className="tag-row">{selectedFile.tags.map(t=><span key={t}>{t}</span>)}</div>}<div className="detail-actions"><button className="button primary" onClick={()=>downloadFile(selectedFile)}><ArrowDownToLine size={17}/> Download file</button><button className="button secondary" onClick={()=>toggleFavorite(selectedFile)}><Star size={17}/> {selectedFile.favorite?'Unfavorite':'Add to favorites'}</button></div></section></div>}
  </div>;
}
