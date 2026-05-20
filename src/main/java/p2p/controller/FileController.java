package p2p.controller;

import com.sun.net.httpserver.Headers;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;
import com.sun.net.httpserver.HttpServer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import p2p.model.TransferRecord;
import p2p.service.Filesharer;
import p2p.service.RateLimiter;

import java.io.*;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.time.Duration;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

public class FileController {
    private static final Logger logger = LoggerFactory.getLogger(FileController.class);

    private static final long MAX_UPLOAD_BYTES = 500L * 1024 * 1024; // 500 MB
    private static final int  RATE_LIMIT_REQUESTS = 20;
    private static final long RATE_LIMIT_WINDOW_MS = 60_000;

    private final Filesharer filesharer;
    private final HttpServer server;
    private final String uploadDir;
    private final ExecutorService executorService;
    private final RateLimiter rateLimiter;
    private final Instant startTime;

    public FileController(int port) throws IOException {
        this.filesharer = new Filesharer();
        this.rateLimiter = new RateLimiter(RATE_LIMIT_REQUESTS, RATE_LIMIT_WINDOW_MS);
        this.startTime = Instant.now();
        this.server = HttpServer.create(new InetSocketAddress(port), 0);
        this.uploadDir = System.getProperty("java.io.tmpdir") + File.separator + "peerlink-uploads";
        this.executorService = Executors.newFixedThreadPool(20);

        new File(uploadDir).mkdirs();

        server.createContext("/upload",   new UploadHandler());
        server.createContext("/download", new DownloadHandler());
        server.createContext("/health",   new HealthHandler());
        server.createContext("/stats",    new StatsHandler());
        server.createContext("/",         new CORSHandler());
        server.setExecutor(executorService);
    }

    public void start() {
        server.start();
        logger.info("API server started on port {}", server.getAddress().getPort());
    }

    public void stop() {
        server.stop(0);
        executorService.shutdown();
        filesharer.shutdown();
        logger.info("API server stopped");
    }

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    private void addCorsHeaders(Headers h) {
        h.add("Access-Control-Allow-Origin", "*");
        h.add("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
        h.add("Access-Control-Allow-Headers", "Content-Type, Authorization, Range");
        h.add("Access-Control-Expose-Headers",
                "Content-Disposition, Content-Length, Content-Range, " +
                "X-Transfer-Code, X-Expires-At, X-Downloads-Remaining");
    }

    private void sendJson(HttpExchange ex, int status, String json) throws IOException {
        byte[] bytes = json.getBytes(StandardCharsets.UTF_8);
        ex.getResponseHeaders().add("Content-Type", "application/json");
        ex.sendResponseHeaders(status, bytes.length);
        try (OutputStream os = ex.getResponseBody()) { os.write(bytes); }
    }

    private void sendError(HttpExchange ex, int status, String code, String message) throws IOException {
        addCorsHeaders(ex.getResponseHeaders());
        String escaped = message.replace("\\", "\\\\").replace("\"", "\\\"");
        sendJson(ex, status, String.format(
                "{\"error\":\"%s\",\"message\":\"%s\",\"statusCode\":%d}", code, escaped, status));
    }

    private String clientIp(HttpExchange ex) {
        String fwd = ex.getRequestHeaders().getFirst("X-Forwarded-For");
        if (fwd != null && !fwd.isBlank()) return fwd.split(",")[0].trim();
        return ex.getRemoteAddress().getAddress().getHostAddress();
    }

    private boolean handlePreflight(HttpExchange ex) throws IOException {
        if ("OPTIONS".equalsIgnoreCase(ex.getRequestMethod())) {
            addCorsHeaders(ex.getResponseHeaders());
            ex.sendResponseHeaders(204, -1);
            return true;
        }
        return false;
    }

    // -------------------------------------------------------------------------
    // Handlers
    // -------------------------------------------------------------------------

    private class CORSHandler implements HttpHandler {
        @Override public void handle(HttpExchange ex) throws IOException {
            addCorsHeaders(ex.getResponseHeaders());
            if (handlePreflight(ex)) return;
            sendJson(ex, 404, "{\"error\":\"NOT_FOUND\",\"message\":\"Not found\",\"statusCode\":404}");
        }
    }

    private class HealthHandler implements HttpHandler {
        @Override public void handle(HttpExchange ex) throws IOException {
            addCorsHeaders(ex.getResponseHeaders());
            if (handlePreflight(ex)) return;
            long uptime = Duration.between(startTime, Instant.now()).getSeconds();
            sendJson(ex, 200, String.format(
                    "{\"status\":\"ok\",\"uptime\":%d,\"activeTransfers\":%d,\"version\":\"2.0\"}",
                    uptime, filesharer.getActiveTransferCount()));
        }
    }

    private class StatsHandler implements HttpHandler {
        @Override public void handle(HttpExchange ex) throws IOException {
            addCorsHeaders(ex.getResponseHeaders());
            if (handlePreflight(ex)) return;
            sendJson(ex, 200, String.format(
                    "{\"totalFilesShared\":%d}", filesharer.getTotalUploads()));
        }
    }

    private class UploadHandler implements HttpHandler {
        @Override public void handle(HttpExchange ex) throws IOException {
            addCorsHeaders(ex.getResponseHeaders());
            if (handlePreflight(ex)) return;

            if (!"POST".equalsIgnoreCase(ex.getRequestMethod())) {
                sendError(ex, 405, "METHOD_NOT_ALLOWED", "Method not allowed"); return;
            }

            String ip = clientIp(ex);
            if (!rateLimiter.isAllowed(ip)) {
                sendError(ex, 429, "RATE_LIMITED", "Too many requests. Please wait a minute."); return;
            }

            // Reject oversized uploads early using Content-Length
            String clHeader = ex.getRequestHeaders().getFirst("Content-Length");
            if (clHeader != null) {
                try {
                    if (Long.parseLong(clHeader) > MAX_UPLOAD_BYTES) {
                        sendError(ex, 413, "TOO_LARGE",
                                "Upload exceeds the 500 MB limit."); return;
                    }
                } catch (NumberFormatException ignored) {}
            }

            String contentType = ex.getRequestHeaders().getFirst("Content-Type");
            if (contentType == null || !contentType.startsWith("multipart/form-data")) {
                sendError(ex, 400, "INVALID_CONTENT_TYPE", "Content-Type must be multipart/form-data"); return;
            }

            try {
                String boundary = contentType.substring(contentType.indexOf("boundary=") + 9);
                if (boundary.startsWith("\"")) boundary = boundary.substring(1, boundary.length() - 1);

                ByteArrayOutputStream baos = new ByteArrayOutputStream();
                try (LimitedInputStream lis = new LimitedInputStream(ex.getRequestBody(), MAX_UPLOAD_BYTES)) {
                    byte[] buf = new byte[65536];
                    int read;
                    while ((read = lis.read(buf)) != -1) baos.write(buf, 0, read);
                } catch (SizeLimitExceededException e) {
                    sendError(ex, 413, "TOO_LARGE", "Upload exceeds the 500 MB limit."); return;
                }

                List<Multiparser.ParseResult> parts = new Multiparser(baos.toByteArray(), boundary).parseAll();
                if (parts.isEmpty()) {
                    sendError(ex, 400, "NO_FILES", "No files found in the request"); return;
                }

                String filePath;
                String originalFilename;

                if (parts.size() == 1) {
                    Multiparser.ParseResult part = parts.get(0);
                    originalFilename = sanitize(part.fileName, "unnamed-file");
                    String unique = UUID.randomUUID() + "_" + originalFilename;
                    filePath = uploadDir + File.separator + unique;
                    Files.write(java.nio.file.Path.of(filePath), part.fileContent);
                    logger.info("Stored single file: {} ({} bytes)", originalFilename, part.fileContent.length);
                } else {
                    // ZIP multiple files server-side
                    originalFilename = "archive.zip";
                    String unique = UUID.randomUUID() + "_archive.zip";
                    filePath = uploadDir + File.separator + unique;
                    try (FileOutputStream fos = new FileOutputStream(filePath);
                         ZipOutputStream zos = new ZipOutputStream(fos)) {
                        for (Multiparser.ParseResult part : parts) {
                            String entryName = sanitize(part.fileName, "file");
                            zos.putNextEntry(new ZipEntry(entryName));
                            zos.write(part.fileContent);
                            zos.closeEntry();
                        }
                    }
                    logger.info("Stored ZIP of {} files as {}", parts.size(), filePath);
                }

                String code = filesharer.offerFile(filePath, originalFilename);
                TransferRecord record = filesharer.getRecord(code);

                sendJson(ex, 200, String.format(
                        "{\"code\":\"%s\",\"expiresAt\":\"%s\",\"maxDownloads\":%d}",
                        code, record.getExpiresAt(), record.getMaxDownloads()));

            } catch (Exception e) {
                logger.error("Upload error", e);
                sendError(ex, 500, "SERVER_ERROR", "Internal server error");
            }
        }
    }

    private class DownloadHandler implements HttpHandler {
        @Override public void handle(HttpExchange ex) throws IOException {
            addCorsHeaders(ex.getResponseHeaders());
            if (handlePreflight(ex)) return;

            if (!"GET".equalsIgnoreCase(ex.getRequestMethod())) {
                sendError(ex, 405, "METHOD_NOT_ALLOWED", "Method not allowed"); return;
            }

            String ip = clientIp(ex);
            if (!rateLimiter.isAllowed(ip)) {
                sendError(ex, 429, "RATE_LIMITED", "Too many requests. Please wait a minute."); return;
            }

            String path = ex.getRequestURI().getPath();
            String code = path.substring(path.lastIndexOf('/') + 1).trim();
            if (code.isEmpty()) {
                sendError(ex, 400, "INVALID_CODE", "No code provided"); return;
            }

            TransferRecord record = filesharer.getRecord(code);
            if (record == null) {
                sendError(ex, 404, "NOT_FOUND",
                        "Code not found. It may have expired or already been used."); return;
            }
            if (record.isExpired()) {
                filesharer.removeRecord(code);
                sendError(ex, 410, "EXPIRED", "This code has expired."); return;
            }
            if (record.isExhausted()) {
                sendError(ex, 410, "EXHAUSTED", "Maximum downloads already reached for this code."); return;
            }

            // Atomically claim a download slot
            if (!filesharer.reserveDownload(code)) {
                sendError(ex, 410, "EXHAUSTED", "Maximum downloads already reached for this code."); return;
            }

            File file = new File(record.getFilePath());
            if (!file.exists()) {
                sendError(ex, 404, "FILE_NOT_FOUND", "File not found on server."); return;
            }

            long fileSize = file.length();
            int remaining = Math.max(0, record.getMaxDownloads() - record.getDownloadCount());
            Headers rh = ex.getResponseHeaders();
            String safeName = record.getOriginalFilename().replace("\"", "\\\"");
            rh.add("Content-Disposition", "attachment; filename=\"" + safeName + "\"");
            rh.add("Content-Type", "application/octet-stream");
            rh.add("Accept-Ranges", "bytes");
            rh.add("X-Expires-At", record.getExpiresAt().toString());
            rh.add("X-Downloads-Remaining", String.valueOf(remaining));

            String rangeHeader = ex.getRequestHeaders().getFirst("Range");

            if (rangeHeader != null && rangeHeader.startsWith("bytes=")) {
                // Partial content (HTTP 206)
                String spec = rangeHeader.substring(6);
                String[] parts = spec.split("-", 2);
                try {
                    long start = Long.parseLong(parts[0]);
                    long end   = (parts.length > 1 && !parts[1].isEmpty())
                            ? Long.parseLong(parts[1]) : fileSize - 1;

                    if (start > end || start >= fileSize) {
                        rh.add("Content-Range", "bytes */" + fileSize);
                        sendError(ex, 416, "RANGE_NOT_SATISFIABLE", "Range not satisfiable"); return;
                    }
                    end = Math.min(end, fileSize - 1);
                    long length = end - start + 1;

                    rh.add("Content-Range", "bytes " + start + "-" + end + "/" + fileSize);
                    ex.sendResponseHeaders(206, length);

                    try (RandomAccessFile raf = new RandomAccessFile(file, "r");
                         OutputStream os = ex.getResponseBody()) {
                        raf.seek(start);
                        byte[] buf = new byte[65536];
                        long remaining2 = length;
                        while (remaining2 > 0) {
                            int n = raf.read(buf, 0, (int) Math.min(buf.length, remaining2));
                            if (n == -1) break;
                            os.write(buf, 0, n);
                            remaining2 -= n;
                        }
                    }
                    logger.info("Partial download served: code={} range={}-{}", code, start, end);
                } catch (NumberFormatException e) {
                    sendError(ex, 400, "INVALID_RANGE", "Invalid Range header"); return;
                }
            } else {
                // Full file
                ex.sendResponseHeaders(200, fileSize);
                try (FileInputStream fis = new FileInputStream(file);
                     OutputStream os = ex.getResponseBody()) {
                    byte[] buf = new byte[65536];
                    int n;
                    while ((n = fis.read(buf)) != -1) os.write(buf, 0, n);
                }
                logger.info("Full download served: code={} name={}", code, record.getOriginalFilename());
            }
        }
    }

    // -------------------------------------------------------------------------
    // Multipart parser — supports multiple file parts
    // -------------------------------------------------------------------------

    private static class Multiparser {
        private final byte[] data;
        private final String boundary;

        Multiparser(byte[] data, String boundary) {
            this.data = data;
            this.boundary = boundary;
        }

        List<ParseResult> parseAll() {
            List<ParseResult> results = new ArrayList<>();
            byte[] boundaryBytes    = ("--" + boundary).getBytes(StandardCharsets.ISO_8859_1);
            byte[] endBoundaryBytes = ("--" + boundary + "--").getBytes(StandardCharsets.ISO_8859_1);
            byte[] headerEnd        = {'\r', '\n', '\r', '\n'};

            int pos = 0;

            while (pos < data.length) {
                int bPos = findSequence(data, boundaryBytes, pos);
                if (bPos == -1) break;

                // End boundary?
                if (startsWith(data, endBoundaryBytes, bPos)) break;

                // Skip past "--boundary\r\n"
                int headerStart = bPos + boundaryBytes.length;
                if (headerStart + 1 < data.length
                        && data[headerStart] == '\r' && data[headerStart + 1] == '\n') {
                    headerStart += 2;
                } else if (headerStart < data.length && data[headerStart] == '\n') {
                    headerStart += 1;
                } else {
                    break;
                }

                int hEnd = findSequence(data, headerEnd, headerStart);
                if (hEnd == -1) break;

                String headers = new String(data, headerStart, hEnd - headerStart, StandardCharsets.ISO_8859_1);
                String fileName = extractFilename(headers);

                int contentStart = hEnd + 4;

                // Content ends at the CRLF immediately before the next boundary
                byte[] nextBoundary = ("\r\n--" + boundary).getBytes(StandardCharsets.ISO_8859_1);
                int contentEnd = findSequence(data, nextBoundary, contentStart);
                if (contentEnd == -1) contentEnd = data.length;

                if (fileName != null) {
                    byte[] content = Arrays.copyOfRange(data, contentStart, contentEnd);
                    results.add(new ParseResult(fileName, content));
                }

                pos = contentEnd;
            }
            return results;
        }

        private static String extractFilename(String headers) {
            for (String line : headers.split("\r\n")) {
                if (!line.toLowerCase().contains("content-disposition")) continue;
                int i = line.indexOf("filename=\"");
                if (i == -1) continue;
                i += 10;
                int j = line.indexOf("\"", i);
                return (j == -1) ? null : line.substring(i, j);
            }
            return null;
        }

        private static boolean startsWith(byte[] data, byte[] prefix, int offset) {
            if (offset + prefix.length > data.length) return false;
            for (int i = 0; i < prefix.length; i++) {
                if (data[offset + i] != prefix[i]) return false;
            }
            return true;
        }

        private static int findSequence(byte[] data, byte[] seq, int from) {
            outer:
            for (int i = from; i <= data.length - seq.length; i++) {
                for (int j = 0; j < seq.length; j++) {
                    if (data[i + j] != seq[j]) continue outer;
                }
                return i;
            }
            return -1;
        }

        static class ParseResult {
            final String fileName;
            final byte[] fileContent;

            ParseResult(String fileName, byte[] fileContent) {
                this.fileName = fileName;
                this.fileContent = fileContent;
            }
        }
    }

    // -------------------------------------------------------------------------
    // Upload size guard
    // -------------------------------------------------------------------------

    private static class SizeLimitExceededException extends IOException {
        SizeLimitExceededException() { super("Upload size limit exceeded"); }
    }

    private static class LimitedInputStream extends InputStream {
        private final InputStream wrapped;
        private final long limit;
        private long count = 0;

        LimitedInputStream(InputStream wrapped, long limit) {
            this.wrapped = wrapped;
            this.limit = limit;
        }

        @Override public int read() throws IOException {
            if (count >= limit) throw new SizeLimitExceededException();
            int b = wrapped.read();
            if (b != -1) count++;
            return b;
        }

        @Override public int read(byte[] buf, int off, int len) throws IOException {
            if (count >= limit) throw new SizeLimitExceededException();
            int toRead = (int) Math.min(len, limit - count);
            int n = wrapped.read(buf, off, toRead);
            if (n > 0) count += n;
            return n;
        }

        @Override public void close() throws IOException { wrapped.close(); }
    }

    // -------------------------------------------------------------------------
    // Utility
    // -------------------------------------------------------------------------

    private static String sanitize(String name, String fallback) {
        if (name == null || name.isBlank()) return fallback;
        // Strip path components to prevent directory traversal
        return new File(name).getName();
    }
}
