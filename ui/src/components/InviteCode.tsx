'use client';

import { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { FiCopy, FiCheck, FiLink, FiClock, FiDownload } from 'react-icons/fi';

interface InviteCodeProps {
  code: string | null;
  expiresAt?: string;
  maxDownloads?: number;
}

export default function InviteCode({ code, expiresAt, maxDownloads }: InviteCodeProps) {
  const [codeCopied, setCodeCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [showQr,     setShowQr]     = useState(false);

  if (!code) return null;

  const [serverCode, keyPart] = code.split('#');
  const shareUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/get/${serverCode}#${keyPart}`
    : '';

  const copy = async (text: string, setter: (v: boolean) => void) => {
    await navigator.clipboard.writeText(text);
    setter(true);
    setTimeout(() => setter(false), 2000);
  };

  const timeLeft = expiresAt
    ? Math.max(0, Math.round((new Date(expiresAt).getTime() - Date.now()) / 60_000))
    : null;

  return (
    <div className="mt-6 p-4 bg-green-500/[0.05] border border-green-500/20 rounded-xl space-y-4">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-sm font-semibold text-green-400">File ready to share</h3>
        <div className="flex gap-3 text-xs text-zinc-500 shrink-0">
          {timeLeft !== null && (
            <span className="flex items-center gap-1">
              <FiClock size={11} className="shrink-0" />
              ~{timeLeft} min
            </span>
          )}
          {maxDownloads !== undefined && (
            <span className="flex items-center gap-1">
              <FiDownload size={11} className="shrink-0" />
              {maxDownloads}×
            </span>
          )}
        </div>
      </div>

      {/* Invite code */}
      <div>
        <p className="text-xs font-medium text-zinc-600 mb-1.5 uppercase tracking-wider">Invite Code</p>
        <div className="flex items-stretch">
          <div className="flex-1 bg-white/[0.05] px-3 py-2.5 rounded-l-xl border border-r-0 border-white/[0.08] font-mono text-xs text-zinc-300 break-all">
            {code}
          </div>
          <button
            onClick={() => copy(code, setCodeCopied)}
            title="Copy invite code"
            className="px-3 bg-orange-500 hover:bg-orange-600 text-white rounded-r-xl transition-colors"
          >
            {codeCopied ? <FiCheck size={14} /> : <FiCopy size={14} />}
          </button>
        </div>
      </div>

      {/* Share link */}
      {shareUrl && (
        <div>
          <p className="text-xs font-medium text-zinc-600 mb-1.5 uppercase tracking-wider">Share Link</p>
          <div className="flex items-stretch">
            <div className="flex-1 bg-white/[0.05] px-3 py-2.5 rounded-l-xl border border-r-0 border-white/[0.08] text-xs text-orange-400 break-all truncate">
              {shareUrl}
            </div>
            <button
              onClick={() => copy(shareUrl, setLinkCopied)}
              title="Copy share link"
              className="px-3 bg-orange-500 hover:bg-orange-600 text-white transition-colors"
            >
              {linkCopied ? <FiCheck size={14} /> : <FiLink size={14} />}
            </button>
            <button
              onClick={() => setShowQr(v => !v)}
              title="Show QR code"
              className="px-3 bg-white/10 hover:bg-white/15 text-zinc-300 rounded-r-xl transition-colors text-xs font-medium"
            >
              QR
            </button>
          </div>
        </div>
      )}

      {/* QR code — keep white background so scanner can read it */}
      {showQr && shareUrl && (
        <div className="flex justify-center p-4 bg-white rounded-xl">
          <QRCodeSVG value={shareUrl} size={180} />
        </div>
      )}

      <p className="text-xs text-zinc-600">
        The recipient can paste the invite code on the <em>Receive</em> tab, or open the share link directly.
        Your file is end-to-end encrypted — the server never sees its contents.
      </p>
    </div>
  );
}
