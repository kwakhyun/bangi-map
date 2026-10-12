package net.fieldtwin.reports;

import net.fieldtwin.ApiError;
import net.fieldtwin.Application;
import net.fieldtwin.Auth;
import net.fieldtwin.Db;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import java.util.ArrayList;
import java.util.UUID;
import java.util.concurrent.*;
import static org.junit.jupiter.api.Assertions.*;

/** Real PostgreSQL locking/rollback tests; opt in only against a disposable loopback database. */
@EnabledIfEnvironmentVariable(named="BANGI_TEST_DATABASE",
        matches="jdbc:postgresql://127\\.0\\.0\\.1:55432/bangi_refactor_[a-zA-Z0-9_]+")
@SpringBootTest(classes=Application.class, webEnvironment=SpringBootTest.WebEnvironment.NONE,
        properties={"fieldtwin.environment=local", "fieldtwin.demo=true", "spring.flyway.enabled=true", "SEOUL_API_KEY="})
class ReportConcurrencyTest {
    @DynamicPropertySource
    static void database(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", () -> System.getenv("BANGI_TEST_DATABASE"));
        registry.add("spring.datasource.username", () -> "fieldtwin");
        registry.add("spring.datasource.password", () -> "fieldtwin-local-only");
    }

    @Autowired ReportService service;
    @Autowired Db db;
    @Autowired PlatformTransactionManager manager;

    private ReportCommands.Submission submission() {
        return new ReportCommands.Submission("bike-1268", "INFO", "리팩터링 검증용 합성 제보입니다.",
                UUID.randomUUID().toString(), UUID.randomUUID() + "-" + UUID.randomUUID(), null);
    }

    @Test void independentRequestCommitsWhileRetryWaitsForOriginalTransaction() throws Exception {
        var command = submission();
        var peer = UUID.randomUUID().toString();
        var inserted = new CountDownLatch(1);
        var release = new CountDownLatch(1);
        var pool = Executors.newFixedThreadPool(3);
        try {
            var first = pool.submit(() -> new TransactionTemplate(manager).execute(status -> {
                var result = service.submit(command, peer);
                inserted.countDown();
                try {
                    if (!release.await(15, TimeUnit.SECONDS)) throw new IllegalStateException("release timeout");
                } catch (InterruptedException e) { Thread.currentThread().interrupt(); throw new IllegalStateException(e); }
                return result;
            }));
            assertTrue(inserted.await(10, TimeUnit.SECONDS));
            var retry = pool.submit(() -> service.submit(command, peer));
            var independent = pool.submit(() -> service.submit(submission(), UUID.randomUUID().toString()));
            assertFalse(independent.get(5, TimeUnit.SECONDS).duplicate(), "unrelated request must not wait for a global lock");
            assertFalse(retry.isDone(), "a retry must wait for the uncommitted original");
            release.countDown();
            assertFalse(first.get(5, TimeUnit.SECONDS).duplicate());
            assertTrue(retry.get(5, TimeUnit.SECONDS).duplicate());
            assertEquals(1, db.jdbc.queryForObject("SELECT count(*) FROM bangi_reports WHERE request_key=?", Integer.class, command.requestKey()));
            assertEquals(1, db.jdbc.queryForObject("SELECT attempts FROM login_attempts WHERE key_hash=?", Integer.class, Auth.digest("bangi-report:" + peer)));
        } finally {
            release.countDown();
            pool.shutdownNow();
            assertTrue(pool.awaitTermination(10, TimeUnit.SECONDS));
        }
    }

    @Test void simultaneousRequestsCannotExceedDailyQuota() throws Exception {
        var peer = UUID.randomUUID().toString();
        var pool = Executors.newFixedThreadPool(6);
        try {
            var results = new ArrayList<Future<Integer>>();
            for (int i = 0; i < 31; i++) {
                results.add(pool.submit(() -> {
                    try { service.submit(submission(), peer); return 200; }
                    catch (ApiError e) { return e.status; }
                }));
            }
            int accepted = 0, rejected = 0;
            for (var result : results) {
                int status = result.get(15, TimeUnit.SECONDS);
                if (status == 200) accepted++;
                else if (status == 429) rejected++;
                else fail("unexpected status: " + status);
            }
            assertEquals(30, accepted);
            assertEquals(1, rejected);
            assertEquals(30, db.jdbc.queryForObject("SELECT attempts FROM login_attempts WHERE key_hash=?", Integer.class, Auth.digest("bangi-report:" + peer)));
        } finally {
            pool.shutdownNow();
            assertTrue(pool.awaitTermination(10, TimeUnit.SECONDS));
        }
    }

    @Test void auditFailureRollsBackResolution() {
        var command = submission();
        service.submit(command, UUID.randomUUID().toString());
        // Force an audit NOT NULL violation after the report UPDATE has succeeded.
        var invalidAuditUser = new Auth.User(null, "fieldtwin", "primary", "test", "test", "ADMIN", "test");
        assertThrows(org.springframework.dao.DataIntegrityViolationException.class,
                () -> service.resolve(invalidAuditUser, command.requestKey(), new ReportCommands.Resolution("RESOLVED", "합성 제보 처리입니다.", 1)));
        var receipt = service.receipt(command.requestKey(), command.receiptToken());
        assertEquals("RECEIVED", receipt.get("status"));
        assertEquals(1, receipt.get("version"));
    }
}
