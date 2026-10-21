'use client';
import SiteHeader from '@/components/SiteHeader';
import ProjectsModal from '@/components/ProjectsModal';
import Link from 'next/link';
import ProjectActivity from '@/components/ProjectActivity';
export default function Projects(){return <div className="public-site"><SiteHeader/><main className="projects-page"><div className="dashboard-title"><div><span className="public-kicker">YOUR WORKSPACE</span><h1>Good ideas deserve<br/>a place to continue.</h1></div><Link className="public-button dark" href="/workspace?new=1">New project +</Link></div><ProjectsModal standalone state={null} originalBrief="" onClose={()=>{}} onLoad={(state,originalBrief)=>{sessionStorage.setItem('specflow-open-project',JSON.stringify({state,originalBrief}));window.location.assign('/workspace');}}/><ProjectActivity/></main></div>;}
