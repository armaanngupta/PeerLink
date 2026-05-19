'use client';

import { useState, useEffect } from 'react';
import { FiUpload, FiDownload, FiCheck, FiX, FiTrash2, FiCopy } from 'react-icons/fi';
import { getHistory, clearHistory, formatBytes, type HistoryEntry } from '@/utils/history';

export default function TransferHistory() {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    setEntries(getHistory());
  }, []);

  const handleClear = () => {
    clearHistory();
    setEntries([]);
  };

  const copyCode = async (code: string, id: string) => {
    await navigator.clipboard.writeText(code);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  if (entries.length === 0) {
    return (
      <div className="mt-8 text-center text-zinc-700 text-xs py-6 border border-dashed border-white/[0.07] rounded-xl">
        No transfer history yet — uploads and downloads will appear here.
      </div>
    );
  }

  return (
    <div className="mt-8">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xs font-semibold text-zinc-600 uppercase tracking-wider">Transfer History</h2>
        <button
          onClick={handleClear}
          className="flex items-center gap-1 text-xs text-zinc-700 hover:text-red-400 transition-colors"
        >
          <FiTrash2 size={11} /> Clear
        </button>
      </div>

      <ul className="space-y-2">
        {entries.map(entry => (
          <li
            key={entry.id}
            className="flex items-center justify-between p-3 bg-white/[0.03] rounded-xl border border-white/[0.06] text-sm"
          >
            <div className="flex items-center gap-3 min-w-0">
              <span className={`shrink-0 p-1.5 rounded-full ${
                entry.type === 'upload'
                  ? 'bg-orange-500/10 text-orange-400'
                  : 'bg-green-500/10 text-green-400'
              }`}>
                {entry.type === 'upload' ? <FiUpload size={12} /> : <FiDownload size={12} />}
              </span>

              <div className="min-w-0">
                <p className="font-medium text-zinc-300 truncate text-xs">{entry.filename}</p>
                <p className="text-xs text-zinc-600">
                  {formatBytes(entry.size)} · {new Date(entry.timestamp).toLocaleString()}
                  {entry.expiresAt && ` · expires ${new Date(entry.expiresAt).toLocaleTimeString()}`}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0 ml-3">
              <span className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${
                entry.status === 'completed'
                  ? 'bg-green-500/10 text-green-400'
                  : 'bg-red-500/10 text-red-400'
              }`}>
                {entry.status === 'completed' ? <FiCheck size={9} /> : <FiX size={9} />}
                {entry.status}
              </span>

              {entry.type === 'upload' && entry.status === 'completed' && (
                <button
                  onClick={() => copyCode(entry.code, entry.id)}
                  className="text-zinc-600 hover:text-orange-400 transition-colors"
                  title="Copy invite code"
                >
                  {copied === entry.id
                    ? <FiCheck size={13} className="text-green-400" />
                    : <FiCopy size={13} />}
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
