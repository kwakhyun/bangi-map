package net.fieldtwin.reports;

import net.fieldtwin.Auth;
import net.fieldtwin.Db;
import org.springframework.stereotype.Repository;
import java.util.List;
import java.util.Map;
import java.util.Optional;

@Repository
public class ReportRepository {
    private final Db db;
    private static final String RECEIPT_COLUMNS = """
            r.id,r.place_id,p.name place_name,r.category,r.description,r.status,r.response,
            r.version,r.created_at,r.updated_at,(r.photo IS NOT NULL) has_photo
            """;

    public ReportRepository(Db db) { this.db = db; }

    /** Transaction-scoped: only retries of the same request need to wait together. */
    public void lockRequest(String requestKey) {
        db.jdbc.query("SELECT pg_advisory_xact_lock(731208, hashtext(?))", rs -> {}, requestKey);
    }

    public Optional<Map<String, Object>> prior(String requestKey) {
        return db.list("SELECT id,request_hash,receipt_hash FROM bangi_reports WHERE request_key=?", requestKey)
                .stream().findFirst();
    }

    public int incrementDailyCount(String peerHash) {
        var row = db.one("""
                INSERT INTO login_attempts(key_hash) VALUES(?)
                ON CONFLICT(key_hash) DO UPDATE SET
                    attempts=CASE WHEN login_attempts.window_start<now()-interval '1 day'
                        THEN 1 ELSE login_attempts.attempts+1 END,
                    window_start=CASE WHEN login_attempts.window_start<now()-interval '1 day'
                        THEN now() ELSE login_attempts.window_start END
                RETURNING attempts
                """, peerHash);
        return ((Number) row.get("attempts")).intValue();
    }

    public void insert(ReportCommands.Submission command, String requestHash, String receiptHash, byte[] photo) {
        db.update("""
                INSERT INTO bangi_reports(id,place_id,category,description,receipt_hash,request_key,request_hash,photo,photo_type)
                VALUES(?,?,?,?,?,?,?,?,?)
                """, command.requestKey(), command.placeId(), command.category(), command.description().strip(),
                receiptHash, command.requestKey(), requestHash, photo, photo == null ? null : "image/jpeg");
    }

    public Optional<Map<String, Object>> receipt(String id) {
        return db.list("SELECT " + RECEIPT_COLUMNS + ",r.receipt_hash "
                + "FROM bangi_reports r JOIN bangi_places p ON p.id=r.place_id WHERE r.id=?", id)
                .stream().findFirst();
    }

    public List<Map<String, Object>> recent() {
        return db.list("SELECT " + RECEIPT_COLUMNS
                + " FROM bangi_reports r JOIN bangi_places p ON p.id=r.place_id ORDER BY r.created_at DESC LIMIT 200");
    }

    public int resolve(String id, ReportCommands.Resolution command) {
        return db.update("""
                UPDATE bangi_reports SET status=?,response=?,version=version+1,updated_at=now()
                WHERE id=? AND version=?
                """, command.status(), command.response().strip(), id, command.version());
    }

    public void auditResolution(Auth.User user, String id, String status) {
        db.audit(user, "BANGI_REPORT_UPDATED", id, Map.of("status", status));
    }

    public byte[] photo(String id) {
        return (byte[]) db.one("SELECT photo FROM bangi_reports WHERE id=? AND photo IS NOT NULL", id).get("photo");
    }
}
