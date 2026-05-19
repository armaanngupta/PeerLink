const STORAGE_KEY = 'peerlink_history';
const MAX_ENTRIES = 50;

export type TransferType   = 'upload' | 'download';
export type TransferStatus = 'completed' | 'failed';

export interface HistoryEntry {
  id: string;
  type: TransferType;
  filename: string;
  size: number;
  code: string;
  timestamp: string;   // ISO-8601
  status: TransferStatus;
  expiresAt?: string;  // uploads only
  maxDownloads?: number;
}

export function addHistoryEntry(entry: Omit<HistoryEntry, 'id'>): HistoryEntry {
  const entries = getHistory();
  const newEntry: HistoryEntry = { ...entry, id: crypto.randomUUID() };
  const trimmed = [newEntry, ...entries].slice(0, MAX_ENTRIES);
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed)); } catch { /* storage full */ }
  return newEntry;
}

export function getHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as HistoryEntry[]) : [];
  } catch {
    return [];
  }
}

export function clearHistory(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}
