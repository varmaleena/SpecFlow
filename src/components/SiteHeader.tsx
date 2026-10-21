import Link from 'next/link';
import { AudioLines, ArrowUpRight } from 'lucide-react';
export default function SiteHeader({actions}:{actions?: React.ReactNode}) { return <header className="public-header"><Link href="/" className="public-brand"><AudioLines size={25}/>specflow<span>✳</span></Link><nav><Link href="/connections">Connections</Link><Link href="/projects">My projects</Link>{actions || <Link className="public-nav-cta" href="/login">Open workspace <ArrowUpRight size={14}/></Link>}</nav></header>; }
