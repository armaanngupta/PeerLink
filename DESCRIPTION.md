# PeerLink — Technical Deep-Dive

This document describes the complete architecture of PeerLink: every component, how it interacts with the others, why design decisions were made, and the exact flow a file takes from the moment a user drops it onto the page to the moment it saves on the recipient's device.

---

## Table of Contents

1. [System Architecture Overview](#1-system-architecture-overview)
2. [Security Model — End-to-End Encryption](#2-security-model--end-to-end-encryption)
3. [Backend Components](#3-backend-components)
   - 3.1 App.java
   - 3.2 FileController.java
   - 3.3 Filesharer.java
   - 3.4 TransferRecord.java
   - 3.5 RateLimiter.java
   - 3.6 UploadUtils.java
4. [Frontend Components](#4-frontend-components)
   - 4.1 page.tsx (main page)
   - 4.2 FileUpload.tsx
   - 4.3 FileDownload.tsx
   - 4.4 InviteCode.tsx
   - 4.5 TransferHistory.tsx
   - 4.6 get/[code]/page.tsx (share-link page)
5. [Frontend Utilities](#5-frontend-utilities)
   - 5.1 crypto.ts
   - 5.2 history.ts
6. [Transfer Flows](#6-transfer-flows)
   - 6.1 Upload flow
   - 6.2 Download flow
   - 6.3 Share-link flow
7. [Supporting Systems](#7-supporting-systems)
   - 7.1 Rate limiting
   - 7.2 File lifecycle and cleanup
   - 7.3 HTTP Range / partial download
   - 7.4 Multi-file ZIP
   - 7.5 Structured logging
   - 7.6 Health endpoint
8. [Infrastructure](#8-infrastructure)

---

## 1. System Architecture Overview

```
Browser (Sender)
  │  1. Generate AES key
  │  2. ZIP (if multi-file)
  │  3. Encrypt
  │  4. POST /api/upload (encrypted bytes)
  │
  ├── Next.js (port 3000)
  │     rewrites /api/* → localhost:8080/*
  │
  └── Java API server (port 8080)
        │  5. Save encrypted blob to temp dir
        │  6. Register code in Filesharer
        │  7. Return {code, expiresAt, maxDownloads}
        │
        └── (temp dir: java.io.tmpdir/peerlink-uploads/)

Browser (Sender) receives code, displays:
  - Invite code: abc12345#<base64url-key>
  - Share URL:   https://host/get/abc12345#<base64url-key>
  - QR code of the share URL

Browser (Recipient)
  │  1. GET /api/download/abc12345
  │  (key travels as URL fragment — never to server)
  │
  └── Java API server
        │  2. Look up TransferRecord for abc12345
        │  3. Check expiry + download count
        │  4. Stream encrypted bytes
        │  5. Increment download count
        │
Browser (Recipient)
  │  6. Decrypt with key from invite code
  │  7. Save file locally
```

The key design principle: the server is a dumb blob store. It saves and retrieves opaque bytes. It has no knowledge of file contents because it never possesses the encryption key.

---

## 2. Security Model — End-to-End Encryption

### Encryption algorithm

AES-256-GCM (Galois/Counter Mode). This is an authenticated encryption scheme — it provides both confidentiality (no one can read the data without the key) and integrity (tampering is detected). GCM appends a 16-byte authentication tag to the ciphertext.

### Key generation

```typescript
// utils/crypto.ts
const key = await crypto.subtle.generateKey(
  { name: 'AES-GCM', length: 256 },
  true,       // exportable so we can embed in invite code
  ['encrypt', 'decrypt']
);
```

This uses the browser's native Web Crypto API, which draws from the OS's cryptographically secure random number generator. No third-party crypto library is involved.

### Ciphertext layout

```
[ 12-byte random IV ][ AES-GCM ciphertext + 16-byte auth tag ]
```

The 12-byte Initialization Vector (IV) is generated fresh for every encryption. It is prepended to the ciphertext before upload so the recipient can extract it without any side-channel delivery.

### Key transport — the invite code

The invite code has two parts separated by `#`:

```
abc12345#dGhpcyBpcyBhIDMyLWJ5dGUgQUVTIGtleQ
└───────┘ └──────────────────────────────────┘
 8-char    Base64URL-encoded raw 32-byte AES key
 server
 code
```

The `#` is intentional. In a share URL:

```
https://example.com/get/abc12345#dGhpcyBpcyBhIDMyLWJ5dGUgQUVTIGtleQ
                                 ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
                                 URL fragment — browsers never send this to the server
```

The URL fragment is processed entirely client-side by JavaScript. The server only ever receives `GET /get/abc12345` (the Next.js page route) and `GET /download/abc12345` (the API call). The key part (`#KEY`) is stripped by the browser before any network request is made, making it physically impossible for the server to log or intercept it.

### What the server knows

- The 8-character code
- The original filename (used for `Content-Disposition` header)
- The upload timestamp, expiry time, and download count
- The encrypted bytes (which it cannot decrypt)

### What the server does NOT know

- The encryption key
- The plaintext file contents

---

## 3. Backend Components

### 3.1 `App.java`

The application entry point. Reads the `PORT` environment variable (defaults to `8080`), instantiates `FileController`, calls `start()`, and registers a JVM shutdown hook that calls `stop()`. The shutdown hook ensures the server drains in-flight requests and the `Filesharer` cleans up all temp files before the process exits.

### 3.2 `FileController.java`

The central HTTP server class. Built on `com.sun.net.httpserver.HttpServer` — a lightweight HTTP server included in the JDK with no external framework dependencies.

**Thread pool:** 20 threads (`Executors.newFixedThreadPool(20)`), each capable of handling one concurrent request.

**Contexts registered:**

| Path | Handler | Methods |
|---|---|---|
| `/upload` | `UploadHandler` | POST |
| `/download/*` | `DownloadHandler` | GET |
| `/health` | `HealthHandler` | GET |
| `/` | `CORSHandler` | OPTIONS (preflight) |

**CORS:** All handlers call `addCorsHeaders()` which sets `Access-Control-Allow-Origin: *` and exposes the custom response headers (`X-Expires-At`, `X-Downloads-Remaining`, `Content-Disposition`, etc.). OPTIONS preflight requests are answered with `204 No Content`.

**Rate limiting:** Every `UploadHandler` and `DownloadHandler` call checks `rateLimiter.isAllowed(clientIp)` before doing any work. The client IP is extracted from `X-Forwarded-For` (set by Nginx) with a fallback to the socket remote address.

**Structured errors:** All error paths call `sendError(exchange, statusCode, errorCode, message)` which writes a JSON body:
```json
{"error": "RATE_LIMITED", "message": "Too many requests.", "statusCode": 429}
```

#### Upload handler pipeline

1. Reject non-POST requests → `405`.
2. Check rate limit → `429`.
3. Read `Content-Length` header; if present and `> 500 MB` → `413`.
4. Validate `Content-Type: multipart/form-data` → `400`.
5. Read body through `LimitedInputStream` (hard cap at 500 MB regardless of `Content-Length`).
6. Parse multipart body with `Multiparser.parseAll()`.
7. If zero file parts found → `400`.
8. If one file: write bytes to temp file.
   If multiple files: write all parts into a ZIP using `java.util.zip.ZipOutputStream`.
9. Call `filesharer.offerFile(filePath, originalFilename)` to register and get a code.
10. Return `200` with JSON: `{code, expiresAt, maxDownloads}`.

#### Download handler pipeline

1. Reject non-GET requests → `405`.
2. Check rate limit → `429`.
3. Extract code from URL path suffix.
4. Look up `TransferRecord` in `Filesharer`; if absent → `404`.
5. Check `record.isExpired()` → `410 EXPIRED`.
6. Check `record.isExhausted()` → `410 EXHAUSTED`.
7. Call `filesharer.reserveDownload(code)` (atomic slot claim); if denied → `410`.
8. Verify the file exists on disk → `404`.
9. Set response headers: `Content-Disposition`, `Content-Type`, `Accept-Ranges`, `X-Expires-At`, `X-Downloads-Remaining`.
10. Inspect `Range` header:
    - If present and valid → `206 Partial Content`, seek with `RandomAccessFile`, stream the range.
    - Otherwise → `200 OK`, stream the full file with `FileInputStream`.

#### `Multiparser` (inner class)

A handwritten multipart/form-data parser that operates on raw `byte[]`. It:
- Searches for `--boundary` sequences using a Boyer-Moore-style byte search (`findSequence`).
- Detects the end boundary (`--boundary--`) to stop iteration.
- For each part: scans for `\r\n\r\n` to find the header/body split.
- Extracts `filename="..."` from the `Content-Disposition` header.
- Skips non-file parts (form fields without a filename).
- Returns a `List<ParseResult>` — one entry per file part.

This parser was written instead of using Apache Commons FileUpload to keep the full request body in memory as a `byte[]`, which makes multipart boundary detection simpler and avoids dependency complexity. The 500 MB `LimitedInputStream` cap prevents OOM conditions.

#### `LimitedInputStream` (inner class)

Wraps `InputStream` and throws `SizeLimitExceededException` (a custom `IOException` subclass) if the number of bytes read exceeds the configured limit. This guards against uploads that omit or lie about `Content-Length`.

### 3.3 `Filesharer.java`

The transfer registry. Holds all active `TransferRecord` objects and manages their lifecycle.

**Data structures:**
- `ConcurrentHashMap<String, TransferRecord> registry` — maps code → record.
- `ConcurrentHashMap<String, Instant> pendingDeletions` — maps file path → earliest deletion time.

**Scheduled cleanup:** A daemon thread (`filesharer-cleanup`) runs `cleanup()` every 60 seconds.

#### `offerFile(filePath, originalFilename) → String`

Generates a unique 8-character slug (calling `UploadUtils.generateSlug()` in a loop until it finds one not already in the registry — collision probability is negligible with a 36^8 space), creates a `TransferRecord`, puts it in the registry, and returns the code.

#### `reserveDownload(code) → boolean`

The critical atomic operation:

1. Look up the record. Return `false` if absent or expired (expired records are removed and their files deleted).
2. Call `record.incrementDownloadCount()` — this is an `AtomicInteger.incrementAndGet()`, so it is safe under concurrent requests.
3. If `newCount > maxDownloads`: a race condition put us over the limit. Return `false`.
4. If `newCount == maxDownloads`: this was the last allowed download. Remove from registry (new requests will get `false`), add file path to `pendingDeletions` with a 5-minute future timestamp.
5. Return `true`.

The 5-minute delay before file deletion ensures that the currently-streaming download response can finish reading the file before it is unlinked.

#### `cleanup()`

Runs every minute:
1. Iterates the registry; removes entries where `record.isExpired()` and calls `deleteFile()`.
2. Iterates `pendingDeletions`; for any entry where `Instant.now()` is past the scheduled time, calls `deleteFile()` and removes from the map.

#### `shutdown()`

Called by `FileController.stop()` on JVM exit. Deletes all registered files and all pending-deletion files immediately so the temp directory is not left with orphaned encrypted blobs.

### 3.4 `TransferRecord.java`

Immutable value object (except for the atomic download counter) representing one active transfer.

| Field | Type | Description |
|---|---|---|
| `code` | `String` | 8-char alphanumeric slug |
| `filePath` | `String` | Absolute path to the temp file (encrypted blob) |
| `originalFilename` | `String` | Used in `Content-Disposition` header |
| `uploadedAt` | `Instant` | Upload timestamp |
| `expiresAt` | `Instant` | `uploadedAt + 10 minutes` |
| `maxDownloads` | `int` | `3` (constant) |
| `downloadCount` | `AtomicInteger` | Atomically incremented on each reserved download |

`isExpired()` — `Instant.now().isAfter(expiresAt)`
`isExhausted()` — `downloadCount.get() >= maxDownloads`

### 3.5 `RateLimiter.java`

A sliding-window rate limiter. Configured at `20 requests per IP per 60-second window`.

**Data structure:** `ConcurrentHashMap<String, Deque<Long>>` — one deque of millisecond timestamps per client ID.

**`isAllowed(clientId) → boolean`**

1. Get (or create) the timestamp deque for this client.
2. Lock the deque.
3. Evict timestamps older than `windowMs`.
4. If `deque.size() >= maxRequests` → return `false`.
5. Append `now` → return `true`.

The lock on the deque is per-client (not global), so clients do not block each other.

### 3.6 `UploadUtils.java`

Single static method `generateSlug()`. Uses `SecureRandom` (cryptographically strong) to pick 8 characters from `[a-z0-9]` (36 possibilities each, ~41.4 bits of entropy). This is sufficient as an opaque transfer code, not a secret.

---

## 4. Frontend Components

### 4.1 `page.tsx` — Main Page

The root component. Owns all shared state and orchestrates the upload and download flows.

**State:**

| Variable | Purpose |
|---|---|
| `activeTab` | `'upload'` or `'download'` |
| `isUploading` | Shows progress UI, disables drop zone |
| `uploadProgress` | 0–100, fed from XHR `progress` events |
| `uploadError` | Displayed in `FileUpload` |
| `inviteCode` | The full `{code}#{key}` string shown in `InviteCode` |
| `uploadMeta` | `{expiresAt, maxDownloads}` for display |
| `isDownloading` | Shows progress UI, disables input |
| `downloadProgress` | 0–100, fed from fetch `ReadableStream` |
| `downloadError` | Displayed in `FileDownload` |

**`handleFilesUpload(files)`** — the upload orchestrator:
1. Generate AES key.
2. If `files.length > 1`: dynamically import JSZip, create a ZIP archive in memory.
3. Encrypt the file (or ZIP) buffer.
4. Build `FormData`, call `uploadWithProgress()`.
5. Export the key to base64url, build the full invite code.
6. Update state, write to history.

**`handleDownload(code)`** — the download orchestrator:
1. Split code on `#`.
2. Import the key.
3. Call `downloadWithProgress()` to fetch and stream the encrypted blob.
4. Decrypt with the key.
5. Create a Blob URL, trigger `<a download>`.
6. Write to history.

**`uploadWithProgress(formData, onProgress)`** — wraps `XMLHttpRequest`. XHR is used here (instead of `fetch`) because the Fetch API does not expose upload progress events. The `xhr.upload.progress` event fires as the browser transmits the multipart body.

**`downloadWithProgress(serverCode, onProgress)`** — uses `fetch` + `response.body.getReader()`. Reads the response as a `ReadableStream`, accumulating `Uint8Array` chunks while tracking `received / total` for the progress bar. Returns the combined `ArrayBuffer` and the filename parsed from `Content-Disposition`.

### 4.2 `FileUpload.tsx`

The drag-and-drop upload zone.

- Uses `react-dropzone` with `multiple: true` to allow any number of files.
- Maintains a `selectedFiles` state list displayed as a chip list with individual remove buttons.
- When `isUploading` is true: the drop zone becomes non-interactive (`pointer-events-none`) and the chip list is replaced by an animated progress bar.
- Propagates the full `File[]` array to `onFilesUpload` — the encryption and ZIP logic lives in `page.tsx`, not here.

### 4.3 `FileDownload.tsx`

The recipient's code-entry form.

- Accepts an optional `initialCode` prop so the share-link page can pre-fill it.
- Validates that the code contains `#` (separates server code from key) and that the prefix is exactly 8 characters.
- Shows a progress bar during download: blue while fetching encrypted bytes (`progress < 100`), green pulsing while decrypting.
- Displays either a local validation error or the error passed down from the parent (server-side structured errors like `EXPIRED` or `EXHAUSTED`).

### 4.4 `InviteCode.tsx`

Shown on the upload tab after a successful upload.

- Splits `code` on `#` to construct `shareUrl = ${origin}/get/${serverCode}#${keyPart}`.
- **Invite code row:** displays the full `code` string in a monospace box with a copy button.
- **Share link row:** displays the share URL (truncated) with a copy button and a QR toggle button.
- **QR code:** rendered with `<QRCodeSVG>` from `qrcode.react`; appears below the share link row when toggled. Encodes the full share URL including the `#key` fragment so the recipient just has to scan and tap.
- Shows expiry countdown (minutes remaining) and max-download count as badges.

### 4.5 `TransferHistory.tsx`

A read-only panel showing recent transfers from `localStorage`.

- Loaded on mount via `getHistory()` from `utils/history.ts`.
- Each entry shows: type icon (upload/download), filename, size, timestamp, expiry (for uploads), and a status badge.
- Upload entries have a copy-code button so the user can re-share without scrolling back up.
- A "Clear" button calls `clearHistory()` and resets local state.
- Renders nothing visible if history is empty (shows a placeholder message instead).

### 4.6 `get/[code]/page.tsx` — Share-Link Landing Page

A Next.js dynamic route that handles the URL pattern `/get/{serverCode}#KEY`.

On mount:
1. Reads `params.code` (the server code from the URL path).
2. Reads `window.location.hash.slice(1)` (strips leading `#`) to get the base64url key.
3. Combines them into `{serverCode}#{keyPart}` and stores it in state.

Renders `FileDownload` pre-filled with the full code. If the hash was present (i.e., the user opened a proper share link rather than just navigating to `/get/abc12345`), the download can proceed immediately when the user clicks the button.

After a successful download the page shows a success state with a link back to the home page.

---

## 5. Frontend Utilities

### 5.1 `utils/crypto.ts`

All cryptographic operations using the native `window.crypto.subtle` (Web Crypto API).

| Export | Description |
|---|---|
| `generateKey()` | `crypto.subtle.generateKey` → AES-256-GCM `CryptoKey`, extractable |
| `encryptData(data, key)` | Generates random 12-byte IV; returns `[IV ∥ ciphertext]` as `ArrayBuffer` |
| `decryptData(data, key)` | Reads first 12 bytes as IV, remainder as ciphertext; decrypts and returns plaintext |
| `exportKey(key)` | `crypto.subtle.exportKey('raw', key)` → base64url string |
| `importKey(b64url)` | base64url → `Uint8Array` → `crypto.subtle.importKey` → non-extractable `CryptoKey` |
| `CryptoError` | Custom `Error` subclass thrown on decryption failure (wrong key / tampered data) |

The imported key is marked `extractable: false` so the browser prevents JavaScript from reading the raw key bytes again after import — the key can only be used for decryption.

### 5.2 `utils/history.ts`

Thin wrapper around `localStorage`.

| Export | Description |
|---|---|
| `addHistoryEntry(entry)` | Prepends a new entry (with a `crypto.randomUUID()` id), trims to 50 entries, persists |
| `getHistory()` | Parses JSON from localStorage; returns `[]` on failure |
| `clearHistory()` | `localStorage.removeItem(STORAGE_KEY)` |
| `formatBytes(n)` | Converts a byte count to a human-readable string (B / KB / MB / GB) |

`HistoryEntry` shape:
```typescript
{
  id: string;          // UUID
  type: 'upload' | 'download';
  filename: string;
  size: number;        // bytes
  code: string;        // full invite code (for upload re-sharing)
  timestamp: string;   // ISO-8601
  status: 'completed' | 'failed';
  expiresAt?: string;  // ISO-8601, upload only
  maxDownloads?: number;
}
```

---

## 6. Transfer Flows

### 6.1 Upload Flow

```
User selects files
      │
      ▼
generateKey()  ── AES-256-GCM CryptoKey
      │
      ▼
files.length > 1?
  Yes → JSZip.generateAsync() → ArrayBuffer (ZIP)
  No  → file.arrayBuffer()   → ArrayBuffer (raw file)
      │
      ▼
encryptData(buffer, key)
  → prepend 12-byte IV
  → crypto.subtle.encrypt (AES-256-GCM)
  → ArrayBuffer [IV | ciphertext | auth tag]
      │
      ▼
FormData.append('file', new Blob([encrypted]), filename)
      │
      ▼
XHR POST /api/upload  ← progress events → uploadProgress state
      │
  Server:
  ├── LimitedInputStream (≤500 MB)
  ├── Multiparser.parseAll() → file parts
  ├── Single part: write bytes to temp file
  │   Multiple parts: ZipOutputStream → temp file
  └── filesharer.offerFile() → 8-char code
      │
      ▼
Response: { code: "abc12345", expiresAt: "…", maxDownloads: 3 }
      │
      ▼
exportKey(key) → base64url string
inviteCode = `${code}#${keyB64}`
      │
      ▼
Display InviteCode component:
  - invite code
  - share URL (origin + /get/ + code + # + keyB64)
  - QR code of share URL
      │
      ▼
addHistoryEntry({ type: 'upload', … })
```

### 6.2 Download Flow

```
User pastes invite code "abc12345#KEY"
      │
      ▼
Split on '#':
  serverCode = "abc12345"
  keyB64     = "KEY…"
      │
      ▼
importKey(keyB64) → CryptoKey (decrypt-only)
      │
      ▼
fetch GET /api/download/abc12345
      │
  Server:
  ├── rateLimiter.isAllowed(ip)
  ├── filesharer.getRecord("abc12345")
  ├── check isExpired() / isExhausted()
  ├── filesharer.reserveDownload("abc12345")  ← atomic slot claim
  └── stream file bytes (or range)
      │
ReadableStream reader loop:
  → accumulate Uint8Array chunks
  → track received/total → downloadProgress state
      │
      ▼
decryptData(combined, key)
  → extract IV (first 12 bytes)
  → crypto.subtle.decrypt → plaintext ArrayBuffer
      │
      ▼
new Blob([plaintext])
URL.createObjectURL(blob)
<a download> click → file saved to disk
URL.revokeObjectURL(…)
      │
      ▼
addHistoryEntry({ type: 'download', … })
```

### 6.3 Share-Link Flow

```
Sender shares URL:
  https://example.com/get/abc12345#dGhpcyBpcyBh...

Recipient clicks link
      │
      ▼
Browser navigates to /get/abc12345
  (fragment #dGhpcyBpcyBh... stripped before network request)
      │
      ▼
Next.js renders get/[code]/page.tsx
      │
      ▼
useEffect:
  params.code     = "abc12345"
  window.location.hash.slice(1) = "dGhpcyBpcyBh..."
  fullCode = "abc12345#dGhpcyBpcyBh..."
      │
      ▼
FileDownload pre-filled with fullCode
      │
Recipient clicks "Download File"
      │
      ▼
(same as Download Flow above)
```

---

## 7. Supporting Systems

### 7.1 Rate Limiting

Implemented in `RateLimiter.java` as a sliding-window counter.

**Configuration:** 20 requests / IP / 60 seconds.

Every time `isAllowed(ip)` is called, the deque for that IP is locked, timestamps older than 60 seconds are evicted, the current count is checked, and (if allowed) the current timestamp is appended. This is O(n) where n is the number of requests in the window — in practice negligible.

**Scope:** Both `/upload` and `/download` go through the same limiter instance. A user uploading and downloading counts against the same bucket.

**Bypass detection:** The `X-Forwarded-For` header is read (set by Nginx) to get the real client IP behind the reverse proxy. Direct connections fall back to the socket remote address.

### 7.2 File Lifecycle and Cleanup

Every uploaded file goes through these states:

```
Uploaded → Registered (in Filesharer registry)
         → [0–3 downloads] → Exhausted → Pending deletion (5-min delay)
         → [10 min passes] → Expired → Deleted immediately by cleanup thread
         → [Server shutdown] → Deleted immediately by shutdown hook
```

The 5-minute pending-deletion delay for exhausted files ensures that the last streaming download response can finish reading the file from disk before it is unlinked. Without this delay, the cleanup thread running at the 1-minute mark could delete a file while a 200 MB download is still in progress.

The scheduled cleanup thread also catches any files that were registered but whose `TransferRecord` was removed from the registry early (due to max downloads) — these appear in `pendingDeletions` and are cleaned up there.

On server shutdown (`Filesharer.shutdown()`), both the registry and the pending-deletion map are iterated immediately to delete all remaining files. This prevents temp-directory accumulation across restarts.

### 7.3 HTTP Range / Partial Download

The download endpoint inspects the `Range` request header. If it matches `bytes=start-end`:

1. Validates that `start ≤ end < fileSize`.
2. Clamps `end` to `fileSize - 1`.
3. Sets `Content-Range: bytes start-end/fileSize` and `Content-Length: end-start+1`.
4. Responds with `206 Partial Content`.
5. Opens a `RandomAccessFile`, seeks to `start`, reads exactly `end - start + 1` bytes into a 64 KB buffer, streams to the client.

If no `Range` header is present, a normal `200 OK` response streams the full file.

The `Accept-Ranges: bytes` header is always sent, advertising range support to clients and browser download managers. This allows interrupted downloads to resume.

### 7.4 Multi-File ZIP

**Server side (old architecture):** Previously the server accepted multiple parts and zipped them with `java.util.zip.ZipOutputStream`. This is still wired for single-file encryption scenarios where the server processes raw file data.

**Current architecture (client-side ZIP before encryption):** The `page.tsx` upload handler dynamically imports JSZip (`const JSZip = (await import('jszip')).default`). Dynamic import is used so JSZip is only loaded when needed — it is not bundled into the initial JavaScript payload. All selected files are added to the ZIP with `zip.file(name, arrayBuffer)`, then `zip.generateAsync({ type: 'arraybuffer' })` produces the ZIP bytes in memory. This ZIP is then encrypted as a single blob and uploaded.

The result from the recipient's perspective: they download and decrypt what appears to be a single ZIP file, which they can extract to recover all original files.

### 7.5 Structured Logging

All Java classes obtain a logger via `LoggerFactory.getLogger(ClassName.class)` (SLF4J API). The Logback implementation routes log records to:

- **Console appender:** pattern `HH:mm:ss.SSS [thread] LEVEL logger - message`
- **Rolling file appender:** pattern with full date, writes to `logs/peerlink.log`, rolls daily, keeps 7 days, caps at 100 MB total.

Log levels in use:
- `INFO` — server start/stop, file registered/downloaded, cleanup runs with counts
- `WARN` — rate limit exceeded, file deletion failures
- `DEBUG` — individual file deletions, cleanup details (suppressed in default INFO level)
- `ERROR` — unexpected exceptions in handlers

### 7.6 Health Endpoint

`GET /health` returns:

```json
{
  "status": "ok",
  "uptime": 3742,
  "activeTransfers": 2,
  "version": "2.0"
}
```

- `uptime` is seconds since the server started.
- `activeTransfers` is the current size of the Filesharer registry (codes that have not expired or been exhausted).

This endpoint is intentionally not rate-limited so that load balancers and monitoring tools can poll it freely. Docker and Nginx can use it as a liveness probe.

---

## 8. Infrastructure

### Docker

`Dockerfile.backend` uses a two-stage build:
1. `maven:3.9-openjdk-17-slim` — runs `mvn clean package`.
2. `openjdk:17-slim` — copies the fat JAR, exposes port 8080.

`Dockerfile.frontend` uses a single `node:18-alpine` stage, installs dependencies, builds the Next.js production bundle, and runs `npm start`.

`docker-compose.yml` wires the two containers with `depends_on` and sets `NEXT_PUBLIC_API_URL=http://localhost:8080`. Only ports 3000 and 8080 need to be exposed — no dynamic port range is required.

### Nginx

In production (VPS), Nginx acts as a reverse proxy:
- `location /api/` → proxied to `localhost:8080/`
- `location /` → proxied to `localhost:3000`

This allows both services to be served on port 80 (and 443 with Let's Encrypt) from a single domain.

### PM2

PM2 manages both the Java process (`java -jar`) and the Next.js process (`npm start`) with auto-restart on crash and startup on system boot (`pm2 startup`).

### `vps-setup.sh`

An idempotent setup script for Ubuntu/Debian servers that:
1. Installs Java 17, Node.js 18 LTS, Maven, Nginx, and PM2.
2. Builds the backend JAR and the Next.js production bundle.
3. Writes the Nginx configuration and enables the site.
4. Starts both services under PM2.
5. Saves the PM2 process list and installs the systemd startup hook.
