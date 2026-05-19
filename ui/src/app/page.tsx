'use client';

import Link from 'next/link';
import { useState } from 'react';
import {
  FiLock, FiClock, FiZap, FiPackage,
  FiArrowDown, FiShield, FiRefreshCw,
} from 'react-icons/fi';
import FileUpload from '@/components/FileUpload';
import FileDownload from '@/components/FileDownload';
import InviteCode from '@/components/InviteCode';
import TransferHistory from '@/components/TransferHistory';
import { generateKey, encryptData, exportKey, decryptData, importKey, CryptoError } from '@/utils/crypto';
import { addHistoryEntry } from '@/utils/history';

type Tab = 'upload' | 'download';

function uploadWithProgress(
  formData: FormData,
  onProgress: (pct: number) => void,
): Promise<{ code: string; expiresAt: string; maxDownloads: number }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/upload');
    xhr.upload.addEventListener('progress', e => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    });
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try { resolve(JSON.parse(xhr.responseText)); }
        catch { reject(new Error('Invalid server response')); }
      } else {
        try { reject(new Error(JSON.parse(xhr.responseText).message || `Upload failed (${xhr.status})`)); }
        catch { reject(new Error(`Upload failed (${xhr.status})`)); }
      }
    };
    xhr.onerror = () => reject(new Error('Network error — is the server running?'));
    xhr.send(formData);
  });
}

async function downloadWithProgress(
  serverCode: string,
  onProgress: (pct: number) => void,
): Promise<{ data: ArrayBuffer; filename: string }> {
  const response = await fetch(`/api/download/${serverCode}`);
  if (!response.ok) {
    const err = await response.json().catch(() => ({ message: `Server error ${response.status}` }));
    throw new Error(err.message || `Download failed (${response.status})`);
  }
  const total = parseInt(response.headers.get('Content-Length') || '0', 10);
  const filename = response.headers.get('Content-Disposition')?.match(/filename="(.+?)"/)?.[1] ?? 'downloaded-file';
  const reader = response.body!.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    if (total > 0) onProgress(Math.round((received / total) * 100));
  }
  const combined = new Uint8Array(chunks.reduce((s, c) => s + c.length, 0));
  let offset = 0;
  for (const c of chunks) { combined.set(c, offset); offset += c.length; }
  return { data: combined.buffer, filename };
}

// ---------------------------------------------------------------------------
// Feature cards
// ---------------------------------------------------------------------------
const FEATURES = [
  {
    icon: <FiLock size={18} />,
    title: 'Zero-knowledge encryption',
    desc: 'AES-256-GCM. Keys are generated in your browser and embedded in the invite code — the server only ever stores ciphertext.',
  },
  {
    icon: <FiClock size={18} />,
    title: 'Auto-expiry',
    desc: 'Every code expires after 10 minutes or 3 downloads, whichever comes first. Nothing lingers on the server.',
  },
  {
    icon: <FiPackage size={18} />,
    title: 'Multi-file support',
    desc: 'Select any number of files. They are zipped and encrypted together in-browser before a single upload.',
  },
  {
    icon: <FiZap size={18} />,
    title: 'No account needed',
    desc: 'Drop a file, copy a code, done. No registration, no email, no cloud storage account required.',
  },
  {
    icon: <FiShield size={18} />,
    title: 'Resume downloads',
    desc: 'HTTP Range headers are supported. An interrupted download can be resumed without starting over.',
  },
  {
    icon: <FiRefreshCw size={18} />,
    title: 'Self-hosted',
    desc: 'Run it on your own server. One JAR, one npm build, and an Nginx config. You own the data.',
  },
];

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function Home() {
  const [activeTab,        setActiveTab]        = useState<Tab>('upload');
  const [isUploading,      setIsUploading]      = useState(false);
  const [uploadProgress,   setUploadProgress]   = useState(0);
  const [uploadError,      setUploadError]      = useState<string | null>(null);
  const [inviteCode,       setInviteCode]       = useState<string | null>(null);
  const [uploadMeta,       setUploadMeta]       = useState<{ expiresAt: string; maxDownloads: number } | null>(null);
  const [isDownloading,    setIsDownloading]    = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadError,    setDownloadError]    = useState<string | null>(null);

  const handleFilesUpload = async (files: File[]) => {
    setIsUploading(true);
    setUploadProgress(0);
    setUploadError(null);
    setInviteCode(null);
    setUploadMeta(null);
    try {
      const key = await generateKey();
      let fileData: ArrayBuffer;
      let filename: string;
      if (files.length > 1) {
        const JSZip = (await import('jszip')).default;
        const zip = new JSZip();
        for (const f of files) zip.file(f.name, await f.arrayBuffer());
        fileData = await zip.generateAsync({ type: 'arraybuffer' });
        filename = 'archive.zip';
      } else {
        fileData = await files[0].arrayBuffer();
        filename = files[0].name;
      }
      const encrypted = await encryptData(fileData, key);
      const formData  = new FormData();
      formData.append('file', new Blob([encrypted], { type: 'application/octet-stream' }), filename);
      const result   = await uploadWithProgress(formData, setUploadProgress);
      const keyB64   = await exportKey(key);
      const fullCode = `${result.code}#${keyB64}`;
      setInviteCode(fullCode);
      setUploadMeta({ expiresAt: result.expiresAt, maxDownloads: result.maxDownloads });
      addHistoryEntry({
        type: 'upload', filename, status: 'completed',
        size: files.reduce((s, f) => s + f.size, 0),
        code: fullCode, timestamp: new Date().toISOString(),
        expiresAt: result.expiresAt, maxDownloads: result.maxDownloads,
      });
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setIsUploading(false);
    }
  };

  const handleDownload = async (code: string) => {
    setIsDownloading(true);
    setDownloadProgress(0);
    setDownloadError(null);
    try {
      const hashIdx = code.indexOf('#');
      if (hashIdx === -1) throw new Error('Invalid code — paste the full invite code including the # part');
      const serverCode = code.substring(0, hashIdx);
      const keyB64     = code.substring(hashIdx + 1);
      const key        = await importKey(keyB64);
      const { data: encryptedData, filename } = await downloadWithProgress(serverCode, setDownloadProgress);
      setDownloadProgress(100);
      const decrypted = await decryptData(encryptedData, key);
      const url  = URL.createObjectURL(new Blob([decrypted]));
      const link = document.createElement('a');
      link.href = url; link.download = filename;
      document.body.appendChild(link); link.click(); link.remove();
      URL.revokeObjectURL(url);
      addHistoryEntry({
        type: 'download', filename, status: 'completed',
        size: decrypted.byteLength, code, timestamp: new Date().toISOString(),
      });
    } catch (err) {
      const msg = err instanceof CryptoError
        ? `Decryption failed: ${err.message}`
        : err instanceof Error ? err.message : 'Download failed';
      setDownloadError(msg);
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <>
      {/* ------------------------------------------------------------------ */}
      {/* HERO                                                                */}
      {/* ------------------------------------------------------------------ */}
      <section className="relative">
        {/* Blue radial glow behind headline */}
        <div className="absolute inset-0 bg-hero-glow pointer-events-none" />

        <div className="relative max-w-4xl mx-auto px-5 pt-36 pb-28 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-orange-500/10 border border-orange-500/20 text-orange-400 text-xs font-medium mb-8">
            <FiLock size={11} /> AES-256-GCM · End-to-end encrypted
          </div>

          <h1 className="text-5xl sm:text-6xl font-bold tracking-tight leading-[1.1] mb-6 text-white">
            Share files securely.<br />
            <span className="text-orange-400">No cloud. No account.</span>
          </h1>

          <p className="text-lg text-zinc-400 max-w-xl mx-auto mb-10 leading-relaxed">
            Your files are encrypted in the browser before they leave your device.
            The server stores only ciphertext it cannot read.
            Codes vanish after 10 minutes.
          </p>

          <div className="flex flex-wrap justify-center gap-2.5 mb-14 text-xs">
            {['AES-256-GCM', 'No signup', '10-min expiry', 'Multi-file', 'Self-hosted'].map(tag => (
              <span key={tag} className="px-3 py-1 rounded-full bg-white/[0.05] border border-white/[0.08] text-zinc-400">
                {tag}
              </span>
            ))}
          </div>

          <a
            href="#app"
            className="inline-flex flex-col items-center gap-2 text-zinc-600 hover:text-zinc-300 transition-colors"
          >
            <span className="text-sm">Start sharing</span>
            <FiArrowDown size={16} className="animate-bounce" />
          </a>
        </div>
      </section>

      {/* ── gradient fade: hero → features ── */}
      <div aria-hidden className="h-px bg-gradient-to-r from-transparent via-white/[0.07] to-transparent" />
      <div aria-hidden className="h-14 bg-gradient-to-b from-transparent to-white/[0.02] pointer-events-none" />

      {/* ------------------------------------------------------------------ */}
      {/* FEATURES                                                            */}
      {/* ------------------------------------------------------------------ */}
      <section className="bg-white/[0.02]">
        <div className="max-w-6xl mx-auto px-5 py-14">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURES.map(f => (
              <div key={f.title} className="feature-card flex gap-4">
                <div className="flex-shrink-0 w-9 h-9 rounded-xl bg-orange-500/10 text-orange-400 flex items-center justify-center">
                  {f.icon}
                </div>
                <div>
                  <h3 className="font-semibold text-white mb-1 text-sm">{f.title}</h3>
                  <p className="text-xs text-zinc-500 leading-relaxed">{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── gradient fade: features → app ── */}
      <div aria-hidden className="h-14 bg-gradient-to-b from-white/[0.02] to-transparent pointer-events-none" />

      {/* ------------------------------------------------------------------ */}
      {/* APP                                                                 */}
      {/* ------------------------------------------------------------------ */}
      <section id="app" className="py-24 px-5">
        <div className="max-w-md mx-auto">
          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold text-white mb-2">Try it now</h2>
            <p className="text-zinc-500 text-sm">
              No login required.{' '}
              <Link href="/how-it-works" className="text-orange-400 hover:text-orange-300 transition-colors">
                How does it work? →
              </Link>
            </p>
          </div>

          <div className="glass-card overflow-hidden">
            {/* Tabs */}
            <div className="flex border-b border-white/[0.07]">
              {(['upload', 'download'] as Tab[]).map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`flex-1 py-3.5 text-sm font-medium transition-colors ${
                    activeTab === tab
                      ? 'text-white border-b-2 border-orange-500 bg-orange-500/5'
                      : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.03]'
                  }`}
                >
                  {tab === 'upload' ? '↑  Share a file' : '↓  Receive a file'}
                </button>
              ))}
            </div>

            <div className="p-6">
              {activeTab === 'upload' ? (
                <>
                  <FileUpload
                    onFilesUpload={handleFilesUpload}
                    isUploading={isUploading}
                    uploadProgress={uploadProgress}
                    error={uploadError}
                  />
                  <InviteCode
                    code={inviteCode}
                    expiresAt={uploadMeta?.expiresAt}
                    maxDownloads={uploadMeta?.maxDownloads}
                  />
                </>
              ) : (
                <FileDownload
                  onDownload={handleDownload}
                  isDownloading={isDownloading}
                  downloadProgress={downloadProgress}
                  error={downloadError}
                />
              )}
            </div>
          </div>

          <TransferHistory />
        </div>
      </section>
    </>
  );
}
