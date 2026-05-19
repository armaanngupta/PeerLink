'use client';

/**
 * Share-link landing page: /get/{serverCode}#{base64Key}
 *
 * The encryption key travels in the URL fragment (#…) which browsers never
 * send to the server, keeping it strictly client-side.
 */

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import FileDownload from '@/components/FileDownload';
import { decryptData, importKey } from '@/utils/crypto';
import { addHistoryEntry } from '@/utils/history';

type Phase = 'loading' | 'ready' | 'downloading' | 'done' | 'error';

export default function GetFilePage() {
  const params          = useParams();
  const serverCode      = params.code as string;
  const [fullCode,      setFullCode]      = useState('');
  const [phase,         setPhase]         = useState<Phase>('loading');
  const [progress,      setProgress]      = useState(0);
  const [errorMsg,      setErrorMsg]      = useState('');

  useEffect(() => {
    // URL fragment is never sent to the server — read it client-side only
    const hash = window.location.hash.slice(1); // strip leading '#'
    if (hash) {
      setFullCode(`${serverCode}#${hash}`);
    } else {
      // Link shared without a key — the user will need to type the full code
      setFullCode(serverCode);
    }
    setPhase('ready');
  }, [serverCode]);

  const handleDownload = async (code: string) => {
    setPhase('downloading');
    setProgress(0);
    setErrorMsg('');

    try {
      const hashIdx = code.indexOf('#');
      if (hashIdx === -1) throw new Error('Invalid invite code — missing encryption key');

      const sCode  = code.substring(0, hashIdx);
      const keyB64 = code.substring(hashIdx + 1);
      const key    = await importKey(keyB64);

      // Fetch with progress tracking
      const response = await fetch(`/api/download/${sCode}`);
      if (!response.ok) {
        const err = await response.json().catch(() => ({ message: 'Download failed' }));
        throw new Error(err.message || `Server error ${response.status}`);
      }

      const contentLength = response.headers.get('Content-Length');
      const total = contentLength ? parseInt(contentLength, 10) : 0;
      const contentDisposition = response.headers.get('Content-Disposition') || '';
      const filenameMatch = contentDisposition.match(/filename="(.+?)"/);
      const filename = filenameMatch ? filenameMatch[1] : 'downloaded-file';

      const reader = response.body!.getReader();
      const chunks: Uint8Array[] = [];
      let received = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        received += value.length;
        if (total > 0) setProgress(Math.round((received / total) * 100));
      }

      setProgress(100);

      const combined = new Uint8Array(chunks.reduce((s, c) => s + c.length, 0));
      let offset = 0;
      for (const c of chunks) { combined.set(c, offset); offset += c.length; }

      const decrypted = await decryptData(combined.buffer, key);

      const blob = new Blob([decrypted], { type: 'application/octet-stream' });
      const url  = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);

      addHistoryEntry({
        type: 'download', filename, size: decrypted.byteLength,
        code, timestamp: new Date().toISOString(), status: 'completed',
      });

      setPhase('done');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Download failed';
      setErrorMsg(msg);
      setPhase('error');
      addHistoryEntry({
        type: 'download', filename: 'unknown', size: 0,
        code, timestamp: new Date().toISOString(), status: 'failed',
      });
    }
  };

  return (
    <div className="min-h-screen flex items-start justify-center px-5 py-20">
      <div className="w-full max-w-md">
        <header className="text-center mb-8">
          <Link href="/" className="text-2xl font-bold text-white hover:text-zinc-200 transition-colors">
            PeerLink
          </Link>
          <p className="text-zinc-500 mt-1 text-sm">Someone shared a file with you</p>
        </header>

        <div className="glass-card p-6">
          {phase === 'loading' && (
            <div className="text-center py-8">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-2 border-orange-500 border-t-transparent" />
            </div>
          )}

          {phase === 'done' && (
            <div className="text-center py-8 space-y-4">
              <div className="mx-auto w-14 h-14 bg-green-500/10 rounded-full flex items-center justify-center">
                <svg className="w-7 h-7 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-sm font-medium text-zinc-300">File downloaded successfully!</p>
              <Link href="/" className="text-xs text-orange-400 hover:text-orange-300 transition-colors">
                ← Back to PeerLink
              </Link>
            </div>
          )}

          {(phase === 'ready' || phase === 'downloading' || phase === 'error') && (
            <FileDownload
              onDownload={handleDownload}
              isDownloading={phase === 'downloading'}
              downloadProgress={progress}
              error={phase === 'error' ? errorMsg : null}
              initialCode={fullCode}
            />
          )}
        </div>
      </div>
    </div>
  );
}
