'use client';
import { useState } from 'react';
import Link from 'next/link';
import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { firebaseAuth, firebaseConfigured } from '@/lib/firebase-client';
import SiteHeader from '@/components/SiteHeader';
import { AudioLines, ArrowRight, Check } from 'lucide-react';
export default function Login() {
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  async function login(){setBusy(true);setError('');try{await signInWithPopup(firebaseAuth(),new GoogleAuthProvider());window.location.assign('/projects');}catch(e){setError(e instanceof Error?e.message:'Sign-in could not complete.');}finally{setBusy(false);}}
  return <div className="public-site"><SiteHeader/><main className="auth-layout"><section className="auth-intro"><span className="public-kicker">A PLACE FOR YOUR PROJECTS</span><h1>Pick up where<br/>you <em>left off.</em></h1><p>Keep your decisions, plans and connected destinations in your own workspace.</p><ul><li><Check size={16}/>Save and reopen your projects</li><li><Check size={16}/>Connect your GitHub and Slack accounts</li><li><Check size={16}/>Review every action before delivery</li></ul></section><section className="auth-card"><AudioLines size={34}/><h2>Welcome to SpecFlow.</h2><p>Sign in to save your work and connect your team’s tools.</p><button className="public-button dark" disabled={busy||!firebaseConfigured} onClick={()=>void login()}>{busy?'Opening Google…':'Continue with Google'}<ArrowRight size={17}/></button>{!firebaseConfigured&&<p role="status">Account sign-in is awaiting deployment configuration. You can still try the guest workspace.</p>}{error&&<p role="alert">{error}</p>}<div className="auth-divider">OR EXPLORE FIRST</div><Link className="public-button outline" href="/workspace?guest=1">Try as a guest <ArrowRight size={17}/></Link><small>Guest plans stay in this browser. Sign in when you want to save to your account.</small></section></main></div>;
}
