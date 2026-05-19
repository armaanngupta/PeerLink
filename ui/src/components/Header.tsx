'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { FiGithub } from 'react-icons/fi';

const GITHUB_URL = 'https://github.com/armaanngupta/PeerLink';

export default function Header() {
  const pathname = usePathname();

  return (
    // pointer-events-none on the outer wrapper so the transparent area
    // around the pill doesn't block page clicks
    <header className="fixed top-4 inset-x-0 z-50 flex justify-center pointer-events-none px-4">
      <div className="pointer-events-auto flex items-center h-11 rounded-full bg-zinc-950/80 backdrop-blur-xl border border-white/[0.10] shadow-2xl shadow-black/40 px-1.5 gap-0.5">

        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 px-3 py-1 select-none">
          <Image
            src="/logo.svg"
            alt="PeerLink"
            width={20}
            height={20}
            className="flex-shrink-0"
          />
          <span className="font-semibold text-white text-sm tracking-tight">PeerLink</span>
        </Link>

        {/* Divider */}
        <div className="w-px h-4 bg-white/[0.10] mx-1 flex-shrink-0" />

        {/* Nav */}
        <Link
          href="/how-it-works"
          className={`px-3 py-1.5 rounded-full text-sm transition-colors ${
            pathname === '/how-it-works'
              ? 'bg-white/10 text-white font-medium'
              : 'text-zinc-400 hover:text-white hover:bg-white/[0.06]'
          }`}
        >
          How it works
        </Link>
        <a
          href={GITHUB_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-colors"
        >
          <FiGithub size={13} />
          Source
        </a>

      </div>
    </header>
  );
}
