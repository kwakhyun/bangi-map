package net.fieldtwin;

import org.junit.jupiter.api.Test;
import java.util.concurrent.*;
import static org.junit.jupiter.api.Assertions.*;

class ReportPhotoConcurrencyTest {
    @Test void boundsDecodingButDoesNotBlockReportsWithoutPhotos() throws Exception {
        var entered = new CountDownLatch(1);
        var release = new CountDownLatch(1);
        var pool = Executors.newSingleThreadExecutor();
        try {
            var first = pool.submit(() -> ReportPhoto.withDecodePermit(() -> {
                entered.countDown();
                try {
                    if (!release.await(5, TimeUnit.SECONDS)) throw new IllegalStateException("release timeout");
                } catch (InterruptedException e) { Thread.currentThread().interrupt(); throw new IllegalStateException(e); }
                return new byte[]{1};
            }));
            assertTrue(entered.await(5, TimeUnit.SECONDS));
            assertNull(ReportPhoto.clean(null));
            assertEquals(429, assertThrows(ApiError.class,
                    () -> ReportPhoto.withDecodePermit(() -> fail("second decoder must not run"))).status);
            release.countDown();
            assertArrayEquals(new byte[]{1}, first.get(5, TimeUnit.SECONDS));
        } finally {
            release.countDown();
            pool.shutdownNow();
            assertTrue(pool.awaitTermination(5, TimeUnit.SECONDS));
        }
    }

    @Test void decoderFailureReleasesCapacity() {
        assertThrows(IllegalStateException.class, () -> ReportPhoto.withDecodePermit(() -> {
            throw new IllegalStateException("decoder failed");
        }));
        assertArrayEquals(new byte[]{2}, ReportPhoto.withDecodePermit(() -> new byte[]{2}));
    }
}
