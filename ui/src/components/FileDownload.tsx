'use client';

import { useState, useEffect } from 'react';
import { FiDownload } from 'react-icons/fi';

interface FileDownloadProps {
  onDownload: (code: string) => Promise<void>;
  isDownloading: boolean;
  downloadProgress: number;
  error: string | null;
  initialCode?: string;
}

export default function FileDownload({
  onDownload,
  isDownloading,
  downloadProgress,
  error,
  initialCode = '',
}: FileDownloadProps) {
  const [inviteCode, setInviteCode] = useState(initialCode);
  const [validationError, setValidationError] = useState('');

  useEffect(() => {
    if (initialCode) setInviteCode(initialCode);
  }, [initialCode]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError('');

    const trimmed = inviteCode.trim();
    if (!trimmed) {
      setValidationError('Please enter an invite code');
      return;
    }
    if (!trimmed.includes('#')) {
      setValidationError('Invalid code format — use the full code including the # part');
      return;
    }
    const [serverCode] = trimmed.split('#');
    if (serverCode.length !== 8) {
      setValidationError('Invalid code — the part before # must be 8 characters');
      return;
    }

    await onDownload(trimmed);
  };

  const displayError = validationError || error;

  return (
    <div className="space-y-4">
      <div className="bg-orange-500/[0.06] p-4 rounded-xl border border-orange-500/20">
        <h3 className="text-sm font-semibold text-orange-300 mb-1">Receive a File</h3>
        <p className="text-xs text-orange-400/80">
          Paste the full invite code shared with you. The code looks like{' '}
          <span className="font-mono text-orange-300">abc12345#KEY…</span>
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="inviteCode" className="block text-xs font-medium text-zinc-400 mb-1.5">
            Invite Code
          </label>
          <input
            type="text"
            id="inviteCode"
            value={inviteCode}
            onChange={e => { setInviteCode(e.target.value); setValidationError(''); }}
            placeholder="abc12345#base64key…"
            className="input-field font-mono text-xs"
            disabled={isDownloading}
            required
          />
          {displayError && (
            <p className="mt-1.5 text-xs text-red-400">{displayError}</p>
          )}
        </div>

        <button
          type="submit"
          className="btn-primary w-full"
          disabled={isDownloading}
        >
          {isDownloading ? (
            <span>Decrypting &amp; saving…</span>
          ) : (
            <>
              <FiDownload size={14} />
              <span>Download File</span>
            </>
          )}
        </button>
      </form>

      {/* Download progress */}
      {isDownloading && (
        <div className="space-y-2">
          <div className="flex justify-between text-xs text-zinc-500">
            <span>{downloadProgress < 100 ? 'Downloading encrypted file…' : 'Decrypting…'}</span>
            <span>{downloadProgress < 100 ? `${downloadProgress}%` : ''}</span>
          </div>
          <div className="w-full bg-white/[0.08] rounded-full h-1.5 overflow-hidden">
            <div
              className={`h-1.5 rounded-full transition-all duration-300 ${
                downloadProgress < 100 ? 'bg-orange-500' : 'bg-green-500 animate-pulse'
              }`}
              style={{ width: downloadProgress < 100 ? `${downloadProgress}%` : '100%' }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
