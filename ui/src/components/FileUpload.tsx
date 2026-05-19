'use client';

import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { FiUpload, FiX, FiFile } from 'react-icons/fi';
import { formatBytes } from '@/utils/history';

interface FileUploadProps {
  onFilesUpload: (files: File[]) => void;
  isUploading: boolean;
  uploadProgress: number;
  error: string | null;
}

export default function FileUpload({ onFilesUpload, isUploading, uploadProgress, error }: FileUploadProps) {
  const [dragActive, setDragActive] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);

  const onDrop = useCallback((accepted: File[]) => {
    setDragActive(false);
    if (accepted.length === 0) return;
    setSelectedFiles(accepted);
    onFilesUpload(accepted);
  }, [onFilesUpload]);

  const { getRootProps, getInputProps } = useDropzone({
    onDrop,
    multiple: true,
    onDragEnter: () => setDragActive(true),
    onDragLeave: () => setDragActive(false),
    onDropRejected: () => setDragActive(false),
    disabled: isUploading,
  });

  const removeFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-4">
      <div
        {...getRootProps()}
        className={`
          w-full p-8 border-2 border-dashed rounded-xl text-center cursor-pointer transition-all
          ${dragActive
            ? 'border-orange-500/70 bg-orange-500/[0.06]'
            : 'border-white/[0.10] hover:border-orange-500/40 hover:bg-white/[0.03]'}
          ${isUploading ? 'opacity-50 pointer-events-none' : ''}
        `}
      >
        <input {...getInputProps()} />
        <div className="flex flex-col items-center justify-center space-y-3">
          <div className="p-3 bg-orange-500/10 rounded-full">
            <FiUpload className="w-5 h-5 text-orange-400" />
          </div>
          <p className="text-sm font-medium text-zinc-300">Drag & drop files here, or click to select</p>
          <p className="text-xs text-zinc-600">Select multiple files — they will be bundled and encrypted automatically</p>
        </div>
      </div>

      {/* Selected file list */}
      {selectedFiles.length > 0 && !isUploading && (
        <ul className="space-y-1">
          {selectedFiles.map((f, i) => (
            <li key={i} className="flex items-center justify-between p-2 bg-white/[0.04] rounded-lg text-sm border border-white/[0.06]">
              <span className="flex items-center gap-2 text-zinc-300 truncate">
                <FiFile className="shrink-0 text-orange-400" size={13} />
                <span className="truncate">{f.name}</span>
                <span className="text-zinc-600 shrink-0">({formatBytes(f.size)})</span>
              </span>
              <button
                onClick={() => removeFile(i)}
                className="ml-2 shrink-0 text-zinc-600 hover:text-red-400 transition-colors"
                aria-label="Remove file"
              >
                <FiX size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Upload progress */}
      {isUploading && (
        <div className="space-y-2">
          <div className="flex justify-between text-xs text-zinc-500">
            <span>
              {uploadProgress < 100
                ? `Uploading ${selectedFiles.length > 1 ? `${selectedFiles.length} files` : selectedFiles[0]?.name}…`
                : 'Processing…'}
            </span>
            <span>{uploadProgress}%</span>
          </div>
          <div className="w-full bg-white/[0.08] rounded-full h-1.5 overflow-hidden">
            <div
              className="bg-orange-500 h-1.5 rounded-full transition-all duration-300"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-sm text-red-400">
          {error}
        </div>
      )}
    </div>
  );
}
