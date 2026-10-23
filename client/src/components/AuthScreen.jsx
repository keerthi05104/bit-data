import { useState } from 'react';
import { ArrowRight, Cloud, Eye, EyeOff, LockKeyhole, Mail } from 'lucide-react';

export default function AuthScreen({ onAuth, configured }) {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setMessage('');
    try {
      await onAuth(mode, email.trim(), password);
      if (mode === 'signup') setMessage('Account created. Check your email if verification is enabled.');
    } catch (err) {
      setMessage(err.message || 'Authentication failed.');
    } finally { setBusy(false); }
  }

  return <main className="auth-page">
    <div className="auth-brand"><div className="brand-mark"><Cloud size={20}/></div><span>bit data<span className="brand-period">.</span></span></div>
    <section className="auth-card">
      <div className="eyebrow">YOUR PERSONAL FILE LIBRARY</div>
      <h1>{mode === 'login' ? 'Find what matters.' : 'Make room for clarity.'}</h1>
      <p className="auth-subtitle">{mode === 'login' ? 'Your files, one thoughtful search away.' : 'Create a private space for the files you need to keep.'}</p>
      {!configured && <div className="notice warning">Add your Supabase settings to <code>client/.env</code> before signing in.</div>}
      <form onSubmit={submit}>
        <label>Email address</label>
        <div className="input-wrap"><Mail size={17}/><input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com" required autoComplete="email"/></div>
        <label>Password</label>
        <div className="input-wrap"><LockKeyhole size={17}/><input type={showPassword?'text':'password'} value={password} onChange={e=>setPassword(e.target.value)} placeholder="At least 6 characters" minLength={6} required autoComplete={mode==='login'?'current-password':'new-password'}/><button type="button" className="icon-button" onClick={()=>setShowPassword(!showPassword)} aria-label="Toggle password visibility">{showPassword?<EyeOff size={17}/>:<Eye size={17}/>}</button></div>
        {message && <div className="notice">{message}</div>}
        <button className="button primary full" disabled={busy || !configured}>{busy?'Please wait…':mode==='login'?'Sign in':'Create account'} <ArrowRight size={17}/></button>
      </form>
      <p className="auth-switch">{mode==='login'?'New to bit data?':'Already have an account?'} <button onClick={()=>{setMode(mode==='login'?'signup':'login');setMessage('')}}>{mode==='login'?'Create an account':'Sign in'}</button></p>
      <div className="auth-foot"><LockKeyhole size={14}/> Your library is private to your account.</div>
    </section>
    <p className="auth-bottom">Less searching. More doing.</p>
  </main>;
}
