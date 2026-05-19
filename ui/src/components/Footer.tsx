import Link from 'next/link';
import Image from 'next/image';
import { FiGithub } from 'react-icons/fi';

const GITHUB_URL = 'https://github.com/your-username/peerlink';

export default function Footer() {
  return (
    <footer className="border-t border-white/[0.06] mt-32">
      <div className="max-w-6xl mx-auto px-5 py-10 flex flex-col sm:flex-row items-center justify-between gap-5">

        {/* Brand */}
        <div className="flex items-center gap-2.5">
          <Image
            src="/logo.svg"
            alt="PeerLink"
            width={22}
            height={22}
            className="flex-shrink-0"
          />
          <span className="text-sm font-semibold text-white">PeerLink</span>
          <span className="text-zinc-600 text-sm">— end-to-end encrypted file sharing</span>
        </div>

        {/* Links */}
        <nav className="flex items-center gap-5 text-sm text-zinc-500">
          <Link href="/" className="hover:text-zinc-300 transition-colors">Home</Link>
          <Link href="/how-it-works" className="hover:text-zinc-300 transition-colors">How it works</Link>
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 hover:text-zinc-300 transition-colors"
          >
            <FiGithub size={13} />
            GitHub
          </a>
        </nav>

      </div>
    </footer>
  );
}
