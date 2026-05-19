package p2p.service;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class RateLimiterTest {

    @Test
    void allowsRequestsUnderLimit() {
        RateLimiter limiter = new RateLimiter(5, 60_000);
        for (int i = 0; i < 5; i++) {
            assertTrue(limiter.isAllowed("client-a"), "Request " + (i + 1) + " should be allowed");
        }
    }

    @Test
    void blocksRequestsOverLimit() {
        RateLimiter limiter = new RateLimiter(3, 60_000);
        limiter.isAllowed("client-b");
        limiter.isAllowed("client-b");
        limiter.isAllowed("client-b");
        assertFalse(limiter.isAllowed("client-b"), "4th request should be blocked");
    }

    @Test
    void differentClientsAreIndependent() {
        RateLimiter limiter = new RateLimiter(2, 60_000);
        limiter.isAllowed("client-x");
        limiter.isAllowed("client-x");
        assertFalse(limiter.isAllowed("client-x"), "client-x should be rate-limited");
        assertTrue(limiter.isAllowed("client-y"),  "client-y should still be allowed");
    }

    @Test
    void windowResetAllowsNewRequests() throws InterruptedException {
        // 10 ms window for fast testing
        RateLimiter limiter = new RateLimiter(2, 50);
        limiter.isAllowed("client-c");
        limiter.isAllowed("client-c");
        assertFalse(limiter.isAllowed("client-c"), "Should be rate-limited");

        Thread.sleep(60); // Let the window expire

        assertTrue(limiter.isAllowed("client-c"), "Should be allowed after window reset");
    }

    @Test
    void firstRequestAlwaysAllowed() {
        RateLimiter limiter = new RateLimiter(1, 60_000);
        assertTrue(limiter.isAllowed("brand-new-client"));
    }
}
