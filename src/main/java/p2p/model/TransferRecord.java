package p2p.model;

import java.time.Duration;
import java.time.Instant;
import java.util.concurrent.atomic.AtomicInteger;

public class TransferRecord {
    static final int DEFAULT_MAX_DOWNLOADS = 3;
    private static final Duration EXPIRY_DURATION = Duration.ofMinutes(10);

    private final String code;
    private final String filePath;
    private final String originalFilename;
    private final Instant uploadedAt;
    private final Instant expiresAt;
    private final int maxDownloads;
    private final AtomicInteger downloadCount;

    public TransferRecord(String code, String filePath, String originalFilename) {
        this.code = code;
        this.filePath = filePath;
        this.originalFilename = originalFilename;
        this.uploadedAt = Instant.now();
        this.expiresAt = uploadedAt.plus(EXPIRY_DURATION);
        this.maxDownloads = DEFAULT_MAX_DOWNLOADS;
        this.downloadCount = new AtomicInteger(0);
    }

    public String getCode() { return code; }
    public String getFilePath() { return filePath; }
    public String getOriginalFilename() { return originalFilename; }
    public Instant getUploadedAt() { return uploadedAt; }
    public Instant getExpiresAt() { return expiresAt; }
    public int getMaxDownloads() { return maxDownloads; }
    public int getDownloadCount() { return downloadCount.get(); }

    public int incrementDownloadCount() { return downloadCount.incrementAndGet(); }

    public boolean isExpired() { return Instant.now().isAfter(expiresAt); }
    public boolean isExhausted() { return downloadCount.get() >= maxDownloads; }
}
