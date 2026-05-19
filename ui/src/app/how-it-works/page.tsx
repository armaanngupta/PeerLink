import Link from 'next/link';
import type { Metadata } from 'next';
import { FiArrowLeft } from 'react-icons/fi';
import TableOfContents from '@/components/TableOfContents';

export const metadata: Metadata = {
  title: 'How PeerLink Works',
  description: 'A detailed explanation of PeerLink\'s end-to-end encryption model, invite codes, and transfer lifecycle.',
};

// ---------------------------------------------------------------------------
// External link helper — inherits .prose-article a styles automatically
// ---------------------------------------------------------------------------
function Ext({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  );
}

// ---------------------------------------------------------------------------
// Layout helpers
// ---------------------------------------------------------------------------

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-5 mb-10">
      <div className="flex-shrink-0 w-9 h-9 rounded-full bg-orange-500 text-white text-sm font-bold flex items-center justify-center mt-0.5">
        {n}
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="text-lg font-semibold text-white mb-2">{title}</h3>
        <div className="prose-article">{children}</div>
      </div>
    </div>
  );
}

function Callout({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="my-6 rounded-xl border border-orange-500/20 bg-orange-500/[0.06] p-5">
      <p className="text-xs font-semibold uppercase tracking-wider text-orange-400 mb-2">{label}</p>
      <div className="text-sm text-zinc-300 leading-relaxed">{children}</div>
    </div>
  );
}

function Table({ rows }: { rows: [string, string][] }) {
  return (
    <div className="overflow-x-auto my-6 rounded-xl border border-white/[0.07]">
      <table className="w-full text-sm">
        <tbody>
          {rows.map(([label, value]) => (
            <tr key={label} className="border-b border-white/[0.07] last:border-0">
              <td className="px-4 py-3 font-medium text-zinc-300 whitespace-nowrap bg-white/[0.03] w-44">{label}</td>
              <td className="px-4 py-3 text-zinc-400">{value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function HowItWorksPage() {
  return (
    <div className="min-h-screen">
      {/* Article hero — uses same flex skeleton as the body so text aligns */}
      <div className="bg-surface border-b border-white/[0.06]">
        <div className="max-w-5xl mx-auto px-5 pt-20 pb-14 lg:flex lg:gap-10">
          {/* Invisible sidebar spacer — keeps headline in line with article text */}
          <div className="hidden lg:block w-48 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <Link
              href="/"
              className="inline-flex items-center gap-2 text-zinc-500 hover:text-zinc-300 text-sm mb-8 transition-colors"
            >
              <FiArrowLeft size={14} /> Back to PeerLink
            </Link>
            <p className="text-orange-400 text-sm font-medium mb-3">Technical explainer</p>
            <h1 className="text-4xl sm:text-5xl font-bold leading-tight mb-5 text-white">
              How PeerLink works
            </h1>
            <p className="text-zinc-400 text-lg leading-relaxed max-w-xl">
              A plain-English walkthrough of the encryption model, the invite code format,
              and exactly what happens — step by step — when you share a file.
            </p>
          </div>
        </div>
      </div>

      {/* Sidebar + article */}
      <div className="max-w-5xl mx-auto px-5 py-16 lg:flex lg:gap-10">

        {/* TOC — hidden on mobile, sticky on desktop */}
        <aside className="hidden lg:block w-48 flex-shrink-0">
          <TableOfContents />
        </aside>

        {/* Article body */}
        <article className="flex-1 min-w-0 min-h-0">

          {/* ---------------------------------------------------------------- */}
          <section className="prose-article">
            <h2 id="core-idea">The core idea</h2>
            <p>
              PeerLink is built around one principle: <strong>the server should never be able
              to read your files</strong>. To achieve this, files are encrypted in the browser
              before they are uploaded. The encryption key is generated locally and embedded
              directly in the invite code — it never travels to the server.
            </p>
            <p>
              When the recipient opens the invite code or share link, their browser
              extracts the key, downloads the encrypted blob from the server, and decrypts
              it locally. The server acts as a temporary, opaque relay — it stores and
              serves ciphertext it has no way to read.
            </p>
          </section>

          {/* ---------------------------------------------------------------- */}
          <section className="prose-article mt-4">
            <h2 id="encryption">The encryption model</h2>
            <p>
              PeerLink uses{' '}
              <Ext href="https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/encrypt#aes-gcm">
                <strong>AES-256-GCM</strong>
              </Ext>{' '}
              (Advanced Encryption Standard, 256-bit key,{' '}
              <Ext href="https://en.wikipedia.org/wiki/Galois/Counter_Mode">
                Galois/Counter Mode
              </Ext>
              ). GCM is an{' '}
              <Ext href="https://en.wikipedia.org/wiki/Authenticated_encryption">
                authenticated encryption
              </Ext>{' '}
              scheme — it provides both confidentiality (nobody reads the data without the
              key) and integrity (any tampering is detected and the decryption fails loudly).
            </p>

            <h3>How the ciphertext is structured</h3>
            <p>Every encrypted upload is laid out as follows in memory:</p>
            <pre>{`[ 12-byte random IV ][ AES-GCM ciphertext ][ 16-byte auth tag ]`}</pre>
            <p>
              The{' '}
              <Ext href="https://en.wikipedia.org/wiki/Initialization_vector">
                <strong>IV</strong> (Initialization Vector)
              </Ext>{' '}
              is 12 bytes of cryptographically random data, generated fresh for every
              encryption using{' '}
              <Ext href="https://developer.mozilla.org/en-US/docs/Web/API/Crypto/getRandomValues">
                <code>crypto.getRandomValues()</code>
              </Ext>
              . It is prepended to the ciphertext so the recipient can extract it without
              a separate delivery mechanism.
            </p>
            <p>
              The <strong>auth tag</strong> is the{' '}
              <Ext href="https://en.wikipedia.org/wiki/Galois/Counter_Mode#Mathematical_basis">
                GCM authentication tag
              </Ext>{' '}
              appended automatically by the browser&apos;s Web Crypto API. During
              decryption, if even a single byte of the ciphertext has been altered,
              decryption throws an error rather than returning corrupted data.
            </p>

            <h3>Web Crypto API</h3>
            <p>
              All cryptographic operations use the browser&apos;s native{' '}
              <Ext href="https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto">
                <code>window.crypto.subtle</code>
              </Ext>{' '}
              interface — part of the{' '}
              <Ext href="https://www.w3.org/TR/WebCryptoAPI/">
                W3C Web Cryptography API standard
              </Ext>
              . No third-party crypto library is involved. The Web Crypto API draws from
              the operating system&apos;s cryptographically secure random number generator
              and runs in a separate secure context, inaccessible to page JavaScript after
              key import.
            </p>
          </section>

          {/* ---------------------------------------------------------------- */}
          <section className="prose-article mt-4">
            <h2 id="invite-code">The invite code</h2>
            <p>
              Every transfer produces an invite code with two parts separated by{' '}
              <code>#</code>:
            </p>
            <pre>{`abc12345#dGhpcyBpcyBhIDMyLWJ5dGUgQUVTIGtleQ
└───────┘ └──────────────────────────────────┘
  server    base64url-encoded 32-byte AES key
  code`}</pre>
            <p>
              The <strong>server code</strong> is an 8-character alphanumeric slug generated
              using{' '}
              <Ext href="https://docs.oracle.com/en/java/docs/api/java.base/java/security/SecureRandom.html">
                <code>SecureRandom</code>
              </Ext>
              . It is the identifier the backend uses to look up the encrypted file. It is
              not a secret on its own — you cannot download the file without the key.
            </p>
            <p>
              The <strong>key</strong> is the raw 32-byte AES key encoded with{' '}
              <Ext href="https://datatracker.ietf.org/doc/html/rfc4648#section-5">
                base64url (RFC 4648 §5)
              </Ext>{' '}
              (~43 characters). This never leaves the browser. It is only present in:
            </p>
            <ul>
              <li>The invite code displayed to the sender</li>
              <li>The URL fragment of the share link (see below)</li>
              <li>The recipient&apos;s browser memory during decryption</li>
            </ul>

            <h3>The share link and the URL fragment</h3>
            <p>The share link looks like this:</p>
            <pre>{`https://example.com/get/abc12345#dGhpcyBpcyBhIDMyLWJ5dGUgQUVTIGtleQ`}</pre>
            <p>
              The <code>#</code> separates the URL path from the{' '}
              <Ext href="https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Identifying_resources_on_the_Web#fragment">
                <strong>URL fragment</strong>
              </Ext>
              . Browsers strip the fragment before making any network request — it is
              processed entirely client-side by JavaScript. This means the server receives
              only <code>GET /get/abc12345</code>; the key portion is physically never
              transmitted.
            </p>

            <Callout label="Security property">
              Even if the server logs every request in full, it cannot reconstruct the
              encryption key from those logs. The key only exists client-side.
            </Callout>
          </section>

          {/* ---------------------------------------------------------------- */}
          <section className="prose-article mt-4">
            <h2 id="sharing">Sharing a file — step by step</h2>
          </section>

          <Step n={1} title="Key generation">
            <p>
              The browser generates a new AES-256-GCM <code>CryptoKey</code> using{' '}
              <Ext href="https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/generateKey">
                <code>crypto.subtle.generateKey()</code>
              </Ext>
              . The key is marked extractable so it can be exported later, but it never
              leaves the browser tab.
            </p>
          </Step>

          <Step n={2} title="ZIP (if multiple files)">
            <p>
              If more than one file is selected,{' '}
              <Ext href="https://stuk.github.io/jszip/">JSZip</Ext> bundles them into a
              single in-memory ZIP archive. The ZIP is treated as a single blob from this
              point forward.
            </p>
          </Step>

          <Step n={3} title="Encryption">
            <p>
              A 12-byte random IV is generated. The file (or ZIP) buffer is encrypted with
              AES-256-GCM. The result is a new <code>ArrayBuffer</code> laid out as{' '}
              <code>[IV | ciphertext | auth tag]</code>.
            </p>
          </Step>

          <Step n={4} title="Upload">
            <p>
              The encrypted blob is posted to <code>POST /api/upload</code> as a{' '}
              <code>multipart/form-data</code> request using <code>XMLHttpRequest</code>
              (which exposes upload progress events that the{' '}
              <Ext href="https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API">
                Fetch API
              </Ext>{' '}
              does not). The progress bar reflects actual bytes transmitted.
            </p>
            <p>
              The server saves the blob to a temp directory with a UUID-prefixed filename.
              It registers the file in an in-memory registry and returns:
            </p>
            <pre>{`{ "code": "abc12345", "expiresAt": "…", "maxDownloads": 3 }`}</pre>
          </Step>

          <Step n={5} title="Invite code assembly">
            <p>
              The browser exports the raw key bytes and encodes them as base64url. The
              full invite code is assembled as <code>{'{code}#{base64url-key}'}</code> and
              displayed to the sender along with:
            </p>
            <ul>
              <li>A one-click copy button</li>
              <li>A shareable URL with the key in the fragment</li>
              <li>A scannable QR code of that URL</li>
            </ul>
          </Step>

          {/* ---------------------------------------------------------------- */}
          <section className="prose-article mt-4">
            <h2 id="receiving">Receiving a file — step by step</h2>
          </section>

          <Step n={1} title="Code entry">
            <p>
              The recipient pastes the full invite code into the Receive tab, or opens the
              share link. If a share link is used, the{' '}
              <code>/get/[code]</code> page reads{' '}
              <Ext href="https://developer.mozilla.org/en-US/docs/Web/API/Location/hash">
                <code>window.location.hash</code>
              </Ext>{' '}
              to extract the key and pre-fills the form.
            </p>
          </Step>

          <Step n={2} title="Key import">
            <p>
              The browser splits the code on <code>#</code>, base64url-decodes the key
              portion, and calls{' '}
              <Ext href="https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/importKey">
                <code>crypto.subtle.importKey()</code>
              </Ext>
              . The returned <code>CryptoKey</code> is marked non-extractable — it can
              only be used for decryption, not read back as raw bytes.
            </p>
          </Step>

          <Step n={3} title="Download with progress">
            <p>
              A <code>GET /api/download/{'{code}'}</code> request is made. The server
              checks: is the code valid? is it expired? have max downloads been reached?
              If all checks pass, it atomically increments the download count and streams
              the encrypted blob.
            </p>
            <p>
              The browser reads the response as a{' '}
              <Ext href="https://developer.mozilla.org/en-US/docs/Web/API/ReadableStream">
                <code>ReadableStream</code>
              </Ext>
              , accumulating chunks while updating the download progress bar in real time
              using the <code>Content-Length</code> header.
            </p>
          </Step>

          <Step n={4} title="Decryption">
            <p>
              Once all bytes are received, the browser extracts the first 12 bytes as the
              IV and passes the remainder to{' '}
              <Ext href="https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/decrypt">
                <code>crypto.subtle.decrypt()</code>
              </Ext>
              . If the auth tag does not match (tampered data or wrong key), decryption
              throws a <code>CryptoError</code> and the download is aborted.
            </p>
          </Step>

          <Step n={5} title="Save to disk">
            <p>
              The decrypted buffer is wrapped in a{' '}
              <Ext href="https://developer.mozilla.org/en-US/docs/Web/API/Blob">
                <code>Blob</code>
              </Ext>
              , a temporary object URL is created, a hidden{' '}
              <code>&lt;a download&gt;</code> is clicked programmatically, and the URL is
              immediately revoked. The file is saved to the browser&apos;s default downloads
              folder under its original filename.
            </p>
          </Step>

          {/* ---------------------------------------------------------------- */}
          <section className="prose-article mt-4">
            <h2 id="expiry">Expiry and cleanup</h2>
            <p>
              Every transfer has a hard expiry of <strong>10 minutes</strong> from the
              moment of upload. It also has a <strong>max-3-downloads</strong> limit.
              The server enforces both:
            </p>
            <ul>
              <li>
                Before serving any download, it checks <code>isExpired()</code> and{' '}
                <code>isExhausted()</code>.
              </li>
              <li>
                Download slot reservation uses an{' '}
                <Ext href="https://docs.oracle.com/en/java/docs/api/java.base/java/util/concurrent/atomic/AtomicInteger.html">
                  <code>AtomicInteger</code>
                </Ext>
                , so two simultaneous requests for the last slot cannot both succeed.
              </li>
              <li>
                When a code is exhausted, it is removed from the registry immediately.
                The file is queued for deletion after a 5-minute delay (to let any
                in-flight streaming response finish).
              </li>
              <li>
                A background cleanup thread runs every minute to evict expired records
                and delete their files.
              </li>
              <li>
                On server shutdown, all registered files are deleted immediately.
              </li>
            </ul>
          </section>

          {/* ---------------------------------------------------------------- */}
          <section className="prose-article mt-4">
            <h2 id="server-knowledge">What the server knows — and doesn&apos;t</h2>
          </section>

          <div className="grid sm:grid-cols-2 gap-4 my-6">
            <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-3">Server knows</p>
              <ul className="text-sm text-zinc-400 space-y-2">
                <li>✓ The 8-character code</li>
                <li>✓ The original filename</li>
                <li>✓ Upload timestamp and expiry</li>
                <li>✓ Download count</li>
                <li>✓ The encrypted bytes (unreadable without the key)</li>
              </ul>
            </div>
            <div className="rounded-xl border border-red-500/20 bg-red-500/[0.04] p-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-red-400 mb-3">Server does NOT know</p>
              <ul className="text-sm text-zinc-400 space-y-2">
                <li>✗ The encryption key</li>
                <li>✗ File contents</li>
                <li>✗ Whether the file is text, image, video, etc.</li>
                <li>✗ Sender or recipient identity</li>
              </ul>
            </div>
          </div>

          {/* ---------------------------------------------------------------- */}
          <section className="prose-article mt-4">
            <h2 id="specs">Technical specifications</h2>
          </section>

          <Table rows={[
            ['Encryption',      'AES-256-GCM (authenticated)'],
            ['IV size',         '12 bytes (random, per-upload)'],
            ['Key size',        '256 bits (32 bytes)'],
            ['Auth tag',        '128 bits (16 bytes, appended by Web Crypto)'],
            ['Max upload size', '500 MB'],
            ['Code expiry',     '10 minutes from upload'],
            ['Max downloads',   '3 per code'],
            ['Code format',     '8 lowercase alphanumeric characters'],
            ['Rate limit',      '20 requests / IP / minute'],
            ['Backend',         'Java 17, com.sun.net.httpserver (no framework)'],
            ['Frontend',        'Next.js 14, React 18, TypeScript'],
            ['Crypto library',  'None — native Web Crypto API only'],
          ]} />

          {/* ---------------------------------------------------------------- */}
          <div className="mt-16 pt-10 border-t border-white/[0.07] text-center">
            <p className="text-zinc-500 text-sm mb-4">Ready to try it?</p>
            <Link
              href="/#app"
              className="btn-primary text-base px-8 py-3"
            >
              Share a file now
            </Link>
          </div>

        </article>
      </div>
    </div>
  );
}
