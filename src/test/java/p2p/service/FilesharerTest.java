package p2p.service;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import p2p.model.TransferRecord;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.*;

class FilesharerTest {

    private Filesharer filesharer;
    private Path tempFile;

    @BeforeEach
    void setUp() throws IOException {
        filesharer = new Filesharer();
        tempFile = Files.createTempFile("peerlink-test-", ".bin");
        Files.write(tempFile, "test content".getBytes());
    }

    @AfterEach
    void tearDown() {
        filesharer.shutdown();
        // File may already be deleted by the filesharer; ignore the error
        try { Files.deleteIfExists(tempFile); } catch (IOException ignored) {}
    }

    @Test
    void offerFile_returnsEightCharCode() {
        String code = filesharer.offerFile(tempFile.toString(), "test.txt");
        assertNotNull(code);
        assertEquals(8, code.length());
        assertTrue(code.matches("[a-z0-9]{8}"), "Code should be lowercase alphanumeric");
    }

    @Test
    void offerFile_recordIsAccessible() {
        String code = filesharer.offerFile(tempFile.toString(), "test.txt");
        TransferRecord record = filesharer.getRecord(code);

        assertNotNull(record);
        assertEquals(code, record.getCode());
        assertEquals("test.txt", record.getOriginalFilename());
        assertEquals(tempFile.toString(), record.getFilePath());
        assertFalse(record.isExpired());
        assertFalse(record.isExhausted());
    }

    @Test
    void offerFile_codesAreUnique() {
        String code1 = filesharer.offerFile(tempFile.toString(), "a.txt");
        String code2 = filesharer.offerFile(tempFile.toString(), "b.txt");
        assertNotEquals(code1, code2);
    }

    @Test
    void reserveDownload_incrementsCount() {
        String code = filesharer.offerFile(tempFile.toString(), "test.txt");
        assertTrue(filesharer.reserveDownload(code));
        assertEquals(1, filesharer.getRecord(code).getDownloadCount());
    }

    @Test
    void reserveDownload_allowsUpToMaxDownloads() {
        String code = filesharer.offerFile(tempFile.toString(), "test.txt");
        int max = filesharer.getRecord(code).getMaxDownloads(); // 3

        for (int i = 0; i < max; i++) {
            assertTrue(filesharer.reserveDownload(code), "Download " + (i + 1) + " should be allowed");
        }
    }

    @Test
    void reserveDownload_removesRecordAfterMaxDownloads() {
        String code = filesharer.offerFile(tempFile.toString(), "test.txt");
        int max = filesharer.getRecord(code).getMaxDownloads();

        for (int i = 0; i < max; i++) filesharer.reserveDownload(code);

        // After max downloads the record is removed from the registry
        assertNull(filesharer.getRecord(code));
    }

    @Test
    void reserveDownload_returnsFalseForUnknownCode() {
        assertFalse(filesharer.reserveDownload("nosuchcode"));
    }

    @Test
    void removeRecord_deletesEntry() {
        String code = filesharer.offerFile(tempFile.toString(), "test.txt");
        assertNotNull(filesharer.getRecord(code));
        filesharer.removeRecord(code);
        assertNull(filesharer.getRecord(code));
    }

    @Test
    void getActiveTransferCount_reflectsRegisteredFiles() {
        assertEquals(0, filesharer.getActiveTransferCount());
        filesharer.offerFile(tempFile.toString(), "a.txt");
        assertEquals(1, filesharer.getActiveTransferCount());
    }
}
