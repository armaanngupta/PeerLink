package p2p.utils;

import java.security.SecureRandom;

public class UploadUtils {
    private static final String SLUG_CHARS = "abcdefghijklmnopqrstuvwxyz0123456789";
    private static final int SLUG_LENGTH = 8;
    private static final SecureRandom RANDOM = new SecureRandom();

    public static String generateSlug() {
        StringBuilder sb = new StringBuilder(SLUG_LENGTH);
        for (int i = 0; i < SLUG_LENGTH; i++) {
            sb.append(SLUG_CHARS.charAt(RANDOM.nextInt(SLUG_CHARS.length())));
        }
        return sb.toString();
    }
}
