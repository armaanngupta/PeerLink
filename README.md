# PeerLink

PeerLink is a self-hosted, end-to-end encrypted file sharing application. Upload one or more files, receive a short invite code, and send it to anyone — they paste it in and the file downloads directly to their device. Files are encrypted in the browser before they ever leave your machine, so the server stores only ciphertext it cannot read.

---

## Features

| Feature | Details |
|---|---|
| **End-to-end encryption** | AES-256-GCM, keys generated in-browser via Web Crypto API and embedded in the invite code — the server never sees them |
| **Multi-file support** | Select multiple files; they are bundled into a ZIP in-browser before encryption |
| **Progress bars** | Real upload progress (XHR) and real download progress (Fetch ReadableStream) |
| **Human-readable invite codes** | Short 8-character alphanumeric slugs (`abc12345#KEY`) instead of raw port numbers |
| **Share via link** | Shareable URL (`/get/{code}#KEY`) — the encryption key lives in the URL fragment and is never sent to the server |
| **QR code** | One click to reveal a scannable QR for the share link |
| **Download expiry** | Each code expires after 10 minutes or 3 downloads, whichever comes first |
| **Automatic cleanup** | Temp files are deleted on expiry, max-download exhaustion, or server shutdown |
| **Transfer history** | Recent uploads and downloads stored locally in `localStorage` |
| **HTTP Range support** | Receivers can resume interrupted downloads |
| **Rate limiting** | 20 requests per IP per minute enforced server-side |
| **Structured errors** | JSON error bodies with machine-readable `error` codes |
| **Structured logging** | SLF4J + Logback with daily rolling log files |
| **Health endpoint** | `GET /health` returns uptime, active transfer count, and version |

---

## Tech Stack

**Backend**

| | |
|---|---|
| Language | Java 17 |
| Build | Maven 3.9 |
| HTTP server | `com.sun.net.httpserver` (zero framework) |
| Logging | SLF4J 2.0 + Logback 1.4 |
| Testing | JUnit 5 + Mockito (23 tests) |

**Frontend**

| | |
|---|---|
| Framework | Next.js 14 (React 18, TypeScript) |
| Styling | Tailwind CSS 3 |
| Encryption | Web Crypto API (built-in, no library) |
| Multi-file ZIP | JSZip 3 (dynamic import, browser-side) |
| QR code | qrcode.react 3 |
| File drag-drop | react-dropzone 14 |

**Infrastructure**

| | |
|---|---|
| Containerisation | Docker + Docker Compose |
| Reverse proxy | Nginx |
| Process manager | PM2 |
| Deployment script | `vps-setup.sh` (Ubuntu/Debian) |

---

## Project Structure

```
PeerLink/
├── src/main/java/p2p/
│   ├── App.java                      # Entry point, shutdown hook
│   ├── controller/
│   │   └── FileController.java       # HTTP handlers, multipart parser, rate limiting
│   ├── model/
│   │   └── TransferRecord.java       # Per-transfer state (code, path, expiry, count)
│   ├── service/
│   │   ├── Filesharer.java           # Code registry, expiry, cleanup scheduler
│   │   └── RateLimiter.java          # Sliding-window per-IP rate limiter
│   └── utils/
│       └── UploadUtils.java          # Cryptographically random slug generation
├── src/main/resources/
│   └── logback.xml                   # Logging config (console + rolling file)
├── src/test/java/p2p/
│   ├── service/
│   │   ├── FilesharerTest.java       # Unit tests for registry and download slots
│   │   └── RateLimiterTest.java      # Unit tests for rate-limiting window
│   └── integration/
│       └── UploadDownloadTest.java   # End-to-end HTTP tests with a live server
├── ui/
│   ├── src/
│   │   ├── app/
│   │   │   ├── page.tsx              # Main upload/download page
│   │   │   └── get/[code]/page.tsx   # Share-link landing page
│   │   ├── components/
│   │   │   ├── FileUpload.tsx        # Multi-file drop zone + progress
│   │   │   ├── FileDownload.tsx      # Code input + progress + error display
│   │   │   ├── InviteCode.tsx        # Code display, copy, share link, QR
│   │   │   └── TransferHistory.tsx   # localStorage-backed history panel
│   │   └── utils/
│   │       ├── crypto.ts             # AES-256-GCM encrypt/decrypt + key export
│   │       └── history.ts            # localStorage read/write helpers
│   ├── next.config.js                # API proxy rewrites to backend
│   └── package.json
├── pom.xml
├── docker-compose.yml
├── Dockerfile.backend
├── Dockerfile.frontend
└── vps-setup.sh
```

---

## Local Setup

### Prerequisites

- Java 17+
- Maven 3.9+
- Node.js 18+

### 1 — Start the backend

```bash
# From the project root
mvn clean package -DskipTests

# The shade plugin produces a single fat JAR
java -jar target/p2p-1.0-SNAPSHOT.jar
```

The API server starts on `http://localhost:8080`.

### 2 — Start the frontend

```bash
cd ui
npm install
npm run dev
```

Open `http://localhost:3000`.

### Run tests

```bash
# Backend (23 JUnit 5 tests)
mvn test

# Frontend type-check
cd ui && npx tsc --noEmit
```

---

## Docker

```bash
docker-compose up --build
```

- Backend: `http://localhost:8080`
- Frontend: `http://localhost:3000`

No dynamic port range needs to be exposed. File transfers now go through the backend's HTTP server on port 8080, not raw TCP sockets.

---

## VPS / EC2 Deployment

```bash
# Clone on your Ubuntu/Debian server
git clone <repo-url>
cd PeerLink

chmod +x vps-setup.sh
./vps-setup.sh
```

The script installs Java 17, Node 18, Nginx, and PM2; builds both services; wires Nginx as a reverse proxy; and enables PM2 auto-start on boot.

Open **port 80** in your cloud firewall. No dynamic port range is needed.

For HTTPS (recommended), point your domain at the server and run:

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

---

## How a Transfer Works (brief)

**Sending**

1. Browser generates an AES-256-GCM key.
2. If multiple files are selected, they are zipped in-browser (JSZip).
3. The file or ZIP is encrypted in-browser (IV prepended to ciphertext).
4. The encrypted blob is uploaded to `POST /upload`.
5. The server stores the blob, registers an 8-character code, and returns `{code, expiresAt, maxDownloads}`.
6. The browser combines the server code with the base64url-encoded key: `abc12345#KEY`.
7. The invite code, share link, and QR are displayed.

**Receiving**

1. Recipient pastes the full invite code or opens the share link.
2. Browser splits the code on `#` to get the server code and the key.
3. `GET /download/{serverCode}` fetches the encrypted blob (with live progress).
4. Browser decrypts using the key — the server never had the key.
5. The decrypted file is saved locally via a Blob URL.

---

## Security Notes

- The encryption key is only ever present in the invite code and URL fragment (`#…`). URL fragments are never sent to the server.
- The server stores and serves ciphertext only. Even a compromised server cannot read file contents.
- Codes expire automatically (10 min / 3 downloads). There is no way to retrieve an expired file.
- Rate limiting prevents abuse of the upload and download endpoints.
- Filenames are path-sanitized on upload to prevent directory traversal.
