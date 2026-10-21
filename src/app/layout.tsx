import type {Metadata} from 'next';
import './globals.css';
import './guided.css';
import './saas.css';
export const metadata:Metadata={title:'SpecFlow — Speak it. Spec it. Ship it.',description:'Turn a spoken idea into architecture, engineering specs, sprint tickets and team updates. Zero API keys required.'};
export default function Layout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>;}
