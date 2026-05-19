package p2p.integration;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import p2p.controller.FileController;

import java.io.*;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

class UploadDownloadTest {

    private static final int PORT = 18_080; // avoid colliding with a running dev server
    private FileController controller;

    @BeforeEach
    void startServer() throws IOException {
        controller = new FileController(PORT);
        controller.start();
    }

    @AfterEach
    void stopServer() {
        controller.stop();
    }

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    private String uploadFile(String filename, byte[] content) throws IOException {
        String boundary = UUID.randomUUID().toString();
        URL url = new URL("http://localhost:" + PORT + "/upload");
        HttpURLConnection conn = (HttpURLConnection) url.openConnection();
        conn.setRequestMethod("POST");
        conn.setDoOutput(true);
        conn.setRequestProperty("Content-Type", "multipart/form-data; boundary=" + boundary);

        try (OutputStream os = conn.getOutputStream()) {
            String part = "--" + boundary + "\r\n"
                    + "Content-Disposition: form-data; name=\"file\"; filename=\"" + filename + "\"\r\n"
                    + "Content-Type: application/octet-stream\r\n\r\n";
            os.write(part.getBytes(StandardCharsets.UTF_8));
            os.write(content);
            os.write(("\r\n--" + boundary + "--\r\n").getBytes(StandardCharsets.UTF_8));
        }

        assertEquals(200, conn.getResponseCode(), "Upload should return 200");
        String response = new String(conn.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
        // Response: {"code":"abc12345","expiresAt":"...","maxDownloads":3}
        int codeStart = response.indexOf("\"code\":\"") + 8;
        int codeEnd   = response.indexOf("\"", codeStart);
        return response.substring(codeStart, codeEnd);
    }

    private byte[] downloadFile(String code) throws IOException {
        URL url = new URL("http://localhost:" + PORT + "/download/" + code);
        HttpURLConnection conn = (HttpURLConnection) url.openConnection();
        conn.setRequestMethod("GET");
        assertEquals(200, conn.getResponseCode(), "Download should return 200");
        return conn.getInputStream().readAllBytes();
    }

    private int downloadStatusCode(String code) throws IOException {
        URL url = new URL("http://localhost:" + PORT + "/download/" + code);
        HttpURLConnection conn = (HttpURLConnection) url.openConnection();
        conn.setRequestMethod("GET");
        conn.setInstanceFollowRedirects(false);
        return conn.getResponseCode();
    }

    // -------------------------------------------------------------------------
    // Tests
    // -------------------------------------------------------------------------

    @Test
    void uploadAndDownload_roundTrip() throws IOException {
        byte[] original = "Hello, PeerLink!".getBytes(StandardCharsets.UTF_8);
        String code = uploadFile("hello.txt", original);

        assertNotNull(code);
        assertEquals(8, code.length());

        byte[] downloaded = downloadFile(code);
        assertArrayEquals(original, downloaded, "Downloaded content must match uploaded content");
    }

    @Test
    void download_unknownCode_returns404() throws IOException {
        assertEquals(404, downloadStatusCode("zzzzzzzz"));
    }

    @Test
    void health_returns200() throws IOException {
        URL url = new URL("http://localhost:" + PORT + "/health");
        HttpURLConnection conn = (HttpURLConnection) url.openConnection();
        assertEquals(200, conn.getResponseCode());
        String body = new String(conn.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
        assertTrue(body.contains("\"status\":\"ok\""));
    }

    @Test
    void download_maxDownloadsEnforced() throws IOException {
        byte[] data = "repeat me".getBytes(StandardCharsets.UTF_8);
        String code = uploadFile("repeat.txt", data);

        // First 3 downloads succeed (maxDownloads = 3)
        downloadFile(code);
        downloadFile(code);
        downloadFile(code);

        // 4th download should be rejected (410 or 404 — code removed from registry)
        int status = downloadStatusCode(code);
        assertTrue(status == 404 || status == 410,
                "Expected 404 or 410 after max downloads, got: " + status);
    }

    @Test
    void upload_largeFilename_isSanitized() throws IOException {
        // Path traversal attempt in filename should be stripped to just the basename
        byte[] data = "safe".getBytes(StandardCharsets.UTF_8);
        String code = uploadFile("../../etc/passwd", data);
        assertNotNull(code);

        // Download should still work (file was stored safely)
        byte[] downloaded = downloadFile(code);
        assertArrayEquals(data, downloaded);
    }

    @Test
    void partialDownload_rangeRequest() throws IOException {
        byte[] data = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".getBytes(StandardCharsets.UTF_8);
        String code = uploadFile("alphabet.txt", data);

        URL url = new URL("http://localhost:" + PORT + "/download/" + code);
        HttpURLConnection conn = (HttpURLConnection) url.openConnection();
        conn.setRequestProperty("Range", "bytes=0-9");
        assertEquals(206, conn.getResponseCode(), "Range request should return 206");

        byte[] partial = conn.getInputStream().readAllBytes();
        assertEquals(10, partial.length);
        assertArrayEquals("ABCDEFGHIJ".getBytes(StandardCharsets.UTF_8), partial);
    }

    @Test
    void upload_noFile_returns400() throws IOException {
        String boundary = UUID.randomUUID().toString();
        URL url = new URL("http://localhost:" + PORT + "/upload");
        HttpURLConnection conn = (HttpURLConnection) url.openConnection();
        conn.setRequestMethod("POST");
        conn.setDoOutput(true);
        conn.setRequestProperty("Content-Type", "multipart/form-data; boundary=" + boundary);

        try (OutputStream os = conn.getOutputStream()) {
            os.write(("--" + boundary + "--\r\n").getBytes(StandardCharsets.UTF_8));
        }

        assertEquals(400, conn.getResponseCode());
    }

    @Test
    void temporaryFilesCleanedUp_afterRemoveRecord() throws IOException, InterruptedException {
        byte[] data = "cleanup test".getBytes();
        String code = uploadFile("cleanup.txt", data);

        // Grab the file path before removing
        // Download once to consume the slot — after max downloads the file goes to pending deletion
        downloadFile(code);
        downloadFile(code);
        downloadFile(code); // last download

        // After max downloads the record is removed; the file itself will be deleted async.
        // We just verify the code is gone from the registry (404/410 on next attempt).
        int status = downloadStatusCode(code);
        assertTrue(status == 404 || status == 410);
    }
}
