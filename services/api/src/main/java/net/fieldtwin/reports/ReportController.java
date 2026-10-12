package net.fieldtwin.reports;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import net.fieldtwin.ApiError;
import net.fieldtwin.Auth;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api")
public class ReportController {
    private final ReportService reports;
    private final Auth auth;

    public ReportController(ReportService reports, Auth auth) {
        this.reports = reports;
        this.auth = auth;
    }

    @PostMapping("/reports")
    public ReportCommands.SubmissionResult submit(HttpServletRequest request,
            @Valid @RequestBody ReportCommands.Submission command) {
        auth.checkOrigin(request);
        return reports.submit(command, request.getRemoteAddr());
    }

    @GetMapping("/reports/{id}")
    public Map<String, Object> receipt(@PathVariable String id,
            @RequestHeader(value="X-Report-Token", required=false) String token) {
        return reports.receipt(id, token);
    }

    @GetMapping("/admin/reports")
    public List<Map<String, Object>> recent(HttpServletRequest request) {
        admin(request, false);
        return reports.recent();
    }

    @PatchMapping("/admin/reports/{id}")
    public Map<String, Boolean> resolve(HttpServletRequest request, @PathVariable String id,
            @Valid @RequestBody ReportCommands.Resolution command) {
        var user = admin(request, true);
        reports.resolve(user, id, command);
        return Map.of("ok", true);
    }

    @GetMapping("/admin/reports/{id}/photo")
    public ResponseEntity<byte[]> photo(HttpServletRequest request, @PathVariable String id) {
        admin(request, false);
        return ResponseEntity.ok().contentType(MediaType.IMAGE_JPEG)
                .header("X-Content-Type-Options", "nosniff").body(reports.photo(id));
    }

    private Auth.User admin(HttpServletRequest request, boolean write) {
        var user = write ? auth.write(request, true) : auth.user(request);
        if (!user.role().equals("ADMIN") || !user.tenantId().equals("fieldtwin")) {
            throw new ApiError(403, "생활지도 운영자 권한이 필요합니다.");
        }
        return user;
    }
}
