package p2p.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import p2p.model.TransferRecord;
import p2p.utils.UploadUtils;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.concurrent.*;

public class Filesharer {
    private static final Logger logger = LoggerFactory.getLogger(Filesharer.class);

    private final ConcurrentHashMap<String, TransferRecord> registry = new ConcurrentHashMap<>();
    // Files removed from the registry (max downloads reached) but kept briefly for in-flight requests
    private final ConcurrentHashMap<String, Instant> pendingDeletions = new ConcurrentHashMap<>();
    private final ScheduledExecutorService scheduler;

    public Filesharer() {
        scheduler = Executors.newSingleThreadScheduledExecutor(r -> {
            Thread t = new Thread(r, "filesharer-cleanup");
            t.setDaemon(true);
            return t;
        });
        scheduler.scheduleAtFixedRate(this::cleanup, 1, 1, TimeUnit.MINUTES);
    }

    public String offerFile(String filePath, String originalFilename) {
        String code;
        int attempts = 0;
        do {
            if (++attempts > 200) throw new IllegalStateException("Could not generate unique code after 200 attempts");
            code = UploadUtils.generateSlug();
        } while (registry.containsKey(code));

        TransferRecord record = new TransferRecord(code, filePath, originalFilename);
        registry.put(code, record);
        logger.info("File registered: code={} name={}", code, originalFilename);
        return code;
    }

    public TransferRecord getRecord(String code) {
        return registry.get(code);
    }

    public void removeRecord(String code) {
        TransferRecord record = registry.remove(code);
        if (record != null) {
            deleteFile(record.getFilePath());
            logger.info("Record removed: code={}", code);
        }
    }

    /**
     * Atomically reserves a download slot. Returns false if the code is unknown,
     * expired, or all download slots are already taken.
     */
    public boolean reserveDownload(String code) {
        TransferRecord record = registry.get(code);
        if (record == null) return false;

        if (record.isExpired()) {
            registry.remove(code);
            deleteFile(record.getFilePath());
            logger.info("Rejected download for expired code: {}", code);
            return false;
        }

        int newCount = record.incrementDownloadCount();
        if (newCount > record.getMaxDownloads()) {
            // Race condition: another thread claimed the last slot first
            return false;
        }

        logger.info("Download reserved: code={} slot={}/{}", code, newCount, record.getMaxDownloads());

        if (newCount >= record.getMaxDownloads()) {
            // Last allowed download — remove from registry to block new attempts,
            // but delay file deletion so the current streaming response can finish.
            registry.remove(code);
            pendingDeletions.put(record.getFilePath(), Instant.now().plusSeconds(300));
            logger.info("Max downloads reached for code={}, file queued for deletion", code);
        }

        return true;
    }

    public int getActiveTransferCount() {
        return registry.size();
    }

    public void shutdown() {
        scheduler.shutdownNow();
        registry.values().forEach(r -> deleteFile(r.getFilePath()));
        registry.clear();
        pendingDeletions.keySet().forEach(this::deleteFile);
        pendingDeletions.clear();
        logger.info("Filesharer shut down, all temp files cleaned up");
    }

    private void cleanup() {
        try {
            Instant now = Instant.now();

            int removedExpired = 0;
            for (var iter = registry.entrySet().iterator(); iter.hasNext(); ) {
                var entry = iter.next();
                if (entry.getValue().isExpired()) {
                    iter.remove();
                    deleteFile(entry.getValue().getFilePath());
                    removedExpired++;
                }
            }

            int deletedOrphans = 0;
            for (var iter = pendingDeletions.entrySet().iterator(); iter.hasNext(); ) {
                var entry = iter.next();
                if (now.isAfter(entry.getValue())) {
                    iter.remove();
                    deleteFile(entry.getKey());
                    deletedOrphans++;
                }
            }

            if (removedExpired > 0 || deletedOrphans > 0) {
                logger.info("Cleanup: removed {} expired records, deleted {} orphaned files. Active: {}",
                        removedExpired, deletedOrphans, registry.size());
            }
        } catch (Exception e) {
            logger.error("Error during scheduled cleanup", e);
        }
    }

    private void deleteFile(String filePath) {
        try {
            boolean deleted = Files.deleteIfExists(Path.of(filePath));
            if (deleted) logger.debug("Deleted temp file: {}", filePath);
        } catch (IOException e) {
            logger.warn("Could not delete file {}: {}", filePath, e.getMessage());
        }
    }
}
