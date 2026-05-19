'use client';

import { useEffect, useState } from 'react';

const ITEMS = [
  { id: 'core-idea',        label: 'The core idea' },
  { id: 'encryption',       label: 'Encryption model' },
  { id: 'invite-code',      label: 'The invite code' },
  { id: 'sharing',          label: 'Sharing a file' },
  { id: 'receiving',        label: 'Receiving a file' },
  { id: 'expiry',           label: 'Expiry & cleanup' },
  { id: 'server-knowledge', label: 'What the server knows' },
  { id: 'specs',            label: 'Technical specs' },
];

export default function TableOfContents() {
  const [active, setActive] = useState('core-idea');

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActive(entry.target.id);
        }
      },
      { rootMargin: '-12% 0% -76% 0%', threshold: 0 },
    );

    ITEMS.forEach(({ id }) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, []);

  return (
    // aside is stretched to full article height (flex default), so sticky
    // tracks through the entire scroll range of the page
    <nav className="sticky top-20">
      <p className="text-xs font-semibold text-zinc-500 uppercase tracking-widest mb-4">
        On this page
      </p>
      <ul className="space-y-0.5">
        {ITEMS.map(({ id, label }) => (
          <li key={id}>
            <a
              href={`#${id}`}
              className={`block text-sm py-2 pl-4 border-l-2 transition-all duration-150 ${
                active === id
                  ? 'border-orange-500 text-orange-400 font-medium'
                  : 'border-white/[0.08] text-zinc-400 hover:text-zinc-200 hover:border-white/30'
              }`}
            >
              {label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
