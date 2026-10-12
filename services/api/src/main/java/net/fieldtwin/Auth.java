package net.fieldtwin;

import jakarta.servlet.http.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.http.ResponseCookie;
import java.security.*;
import java.time.*;
import java.util.*;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.transaction.PlatformTransactionManager;


@Component
public class Auth {
    public record User(String id,String tenantId,String siteId,String name,String email,String role,String csrfToken) {}
    private final Db db;
    private final TransactionTemplate transaction;
    @Value("${fieldtwin.allowed-origin}") String origin;
    @Value("${fieldtwin.cookie-secure}") boolean secure;
    private final BCryptPasswordEncoder encoder=new BCryptPasswordEncoder();
    public Auth(Db db,PlatformTransactionManager manager){this.db=db;this.transaction=new TransactionTemplate(manager);}
    public static String passwordHash(String password) {
        if(password.length()<12 || password.length()>64 || password.getBytes(java.nio.charset.StandardCharsets.UTF_8).length>72)
            throw new ApiError(400,"비밀번호는 12~64자, UTF-8 기준 72바이트 이내로 입력해 주세요.");
        return new BCryptPasswordEncoder(12).encode(password);
    }
    public static String digest(String input) {try{return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(input.getBytes(java.nio.charset.StandardCharsets.UTF_8)));}catch(Exception e){throw new IllegalStateException(e);}}
    public static String randomToken(){byte[] b=new byte[32];new SecureRandom().nextBytes(b);return Base64.getUrlEncoder().withoutPadding().encodeToString(b);}
    public User user(HttpServletRequest req) {
        String token=cookie(req); if(token==null)throw new ApiError(401,"로그인이 필요합니다.");
        var rows=db.list("SELECT u.*,s.csrf_token FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>now() AND u.active=true",digest(token));
        if(rows.isEmpty())throw new ApiError(401,"로그인이 만료되었습니다.");
        var r=rows.get(0);return new User((String)r.get("id"),(String)r.get("tenantId"),(String)r.get("siteId"),(String)r.get("name"),(String)r.get("email"),(String)r.get("role"),(String)r.get("csrfToken"));
    }
    public User write(HttpServletRequest req,boolean adminOnly) {
        var u=user(req); checkOrigin(req);
        String csrf=req.getHeader("X-CSRF-Token");
        if(csrf==null||!MessageDigest.isEqual(csrf.getBytes(),u.csrfToken().getBytes()))throw new ApiError(403,"요청 인증을 확인해 주세요.");
        if(u.role().equals("VIEWER")||(adminOnly&&!u.role().equals("ADMIN")))throw new ApiError(403,"이 작업을 수행할 권한이 없습니다.");
        return u;
    }
    public void checkOrigin(HttpServletRequest req) {
        String supplied=req.getHeader("Origin");
        if(supplied!=null&&!supplied.equals(origin))throw new ApiError(403,"허용되지 않은 요청 출처입니다.");
    }
    public User login(String email,String password,HttpServletRequest req,HttpServletResponse res) {
        checkOrigin(req); String normalized=email.strip().toLowerCase(Locale.ROOT);
        // Atomic database counters are shared by every API replica. Hash identifiers at rest.
        throttle("account:"+normalized,20);
        throttle("peer:"+req.getRemoteAddr(),200);
        var rows=db.list("SELECT * FROM users WHERE lower(email)=?",normalized);
        String dummy="$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy";
        boolean valid=password.getBytes(java.nio.charset.StandardCharsets.UTF_8).length<=72 && encoder.matches(password,rows.isEmpty()?dummy:(String)rows.get(0).get("passwordHash"));
        if(rows.isEmpty()||!valid||!Boolean.TRUE.equals(rows.get(0).get("active")))throw new ApiError(401,"이메일 또는 비밀번호가 올바르지 않습니다.");
        db.update("DELETE FROM login_attempts WHERE key_hash=?",digest("account:"+normalized)); var r=rows.get(0);String token=randomToken(),csrf=randomToken();
        String old=cookie(req);if(old!=null)db.update("DELETE FROM sessions WHERE token_hash=?",digest(old));
        db.update("INSERT INTO sessions(token_hash,user_id,csrf_token,expires_at) VALUES(?,?,?,?)",digest(token),r.get("id"),csrf,java.sql.Timestamp.from(Instant.now().plusSeconds(28800)));
        res.addHeader("Set-Cookie",ResponseCookie.from("ft_session",token).httpOnly(true).secure(secure).sameSite("Strict").path("/").maxAge(28800).build().toString());
        var u=new User((String)r.get("id"),(String)r.get("tenantId"),(String)r.get("siteId"),(String)r.get("name"),(String)r.get("email"),(String)r.get("role"),csrf);
        db.audit(u,"LOGIN",u.id(),Map.of());return u;
    }
    private void throttle(String key,int limit) {
        var row=db.one("INSERT INTO login_attempts(key_hash) VALUES(?) ON CONFLICT(key_hash) DO UPDATE SET attempts=CASE WHEN login_attempts.window_start<now()-interval '15 minutes' THEN 1 ELSE login_attempts.attempts+1 END, window_start=CASE WHEN login_attempts.window_start<now()-interval '15 minutes' THEN now() ELSE login_attempts.window_start END RETURNING attempts",digest(key));
        if(((Number)row.get("attempts")).intValue()>limit)throw new ApiError(429,"로그인 시도가 많습니다. 15분 후 다시 시도해 주세요.");
    }
    public void changePassword(String current,String replacement,HttpServletRequest req,HttpServletResponse res) {
        var u=user(req);checkOrigin(req);
        if(!Objects.equals(req.getHeader("X-CSRF-Token"),u.csrfToken()))throw new ApiError(403,"요청 인증을 확인해 주세요.");
        throttle("password:"+u.id(),10); // Outside the transaction so rejected attempts still count.
        String encoded=passwordHash(replacement);
        transaction.executeWithoutResult(status->{
            var row=db.one("SELECT password_hash FROM users WHERE id=? AND active=true FOR UPDATE",u.id());
            user(req); // Role changes and another password change may revoke this session while waiting.
            if(current.getBytes(java.nio.charset.StandardCharsets.UTF_8).length>72 || !encoder.matches(current,(String)row.get("passwordHash")))throw new ApiError(400,"현재 비밀번호를 확인해 주세요.");
            if(current.equals(replacement))throw new ApiError(400,"현재와 다른 비밀번호를 입력해 주세요.");
            db.update("UPDATE users SET password_hash=?,updated_at=now() WHERE id=?",encoded,u.id());
            db.update("DELETE FROM sessions WHERE user_id=?",u.id());
            db.audit(u,"PASSWORD_CHANGED",u.id(),Map.of());
        });
        res.addHeader("Set-Cookie",ResponseCookie.from("ft_session","").httpOnly(true).secure(secure).sameSite("Strict").path("/").maxAge(0).build().toString());
    }
    public void logout(HttpServletRequest req,HttpServletResponse res){var u=user(req);checkOrigin(req);if(!Objects.equals(req.getHeader("X-CSRF-Token"),u.csrfToken()))throw new ApiError(403,"요청 인증을 확인해 주세요.");db.update("DELETE FROM sessions WHERE token_hash=?",digest(cookie(req)));res.addHeader("Set-Cookie",ResponseCookie.from("ft_session","").httpOnly(true).secure(secure).sameSite("Strict").path("/").maxAge(0).build().toString());}
    private String cookie(HttpServletRequest req){if(req.getCookies()!=null)for(Cookie c:req.getCookies())if(c.getName().equals("ft_session"))return c.getValue();return null;}
}
