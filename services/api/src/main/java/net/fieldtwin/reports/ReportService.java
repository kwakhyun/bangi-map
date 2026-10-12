package net.fieldtwin.reports;

import net.fieldtwin.ApiError;
import net.fieldtwin.Auth;
import net.fieldtwin.ReportPhoto;
import net.fieldtwin.places.PlaceRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

@Service
public class ReportService {
    private final ReportRepository reports;
    private final PlaceRepository places;

    public ReportService(ReportRepository reports, PlaceRepository places) {
        this.reports = reports;
        this.places = places;
    }

    @Transactional
    public ReportCommands.SubmissionResult submit(ReportCommands.Submission command, String peer) {
        places.findActive(command.placeId());
        // Preserve the existing raw-payload hash so previously issued request keys remain retryable.
        String hash = Auth.digest(command.placeId() + "\n" + command.category() + "\n"
                + command.description() + "\n" + Objects.toString(command.photo(), ""));
        String receiptHash = Auth.digest(command.receiptToken());
        reports.lockRequest(command.requestKey());
        var prior = reports.prior(command.requestKey());
        if (prior.isPresent()) {
            var row = prior.get();
            if (!row.get("requestHash").equals(hash) || !row.get("receiptHash").equals(receiptHash)) {
                throw new ApiError(409, "같은 접수 요청에 다른 내용이 포함되어 있습니다.");
            }
            return new ReportCommands.SubmissionResult(row.get("id").toString(), true);
        }
        // Normalize before locking the per-peer quota row; image work should not block other requests.
        byte[] photo = ReportPhoto.clean(command.photo());
        if (reports.incrementDailyCount(Auth.digest("bangi-report:" + peer)) > 30) {
            throw new ApiError(429, "오늘의 제보 한도에 도달했습니다. 잠시 후 다시 이용해 주세요.");
        }
        reports.insert(command, hash, receiptHash, photo);
        return new ReportCommands.SubmissionResult(command.requestKey(), false);
    }

    public Map<String, Object> receipt(String id, String token) {
        var row = reports.receipt(id);
        if (row.isEmpty() || token == null || token.length() > 100
                || !MessageDigest.isEqual(Auth.digest(token).getBytes(StandardCharsets.UTF_8),
                    row.get().get("receiptHash").toString().getBytes(StandardCharsets.UTF_8))) {
            throw new ApiError(404, "접수 내역을 찾을 수 없습니다.");
        }
        var result = new LinkedHashMap<>(row.get());
        result.remove("receiptHash");
        return result;
    }

    public List<Map<String, Object>> recent() { return reports.recent(); }

    @Transactional
    public void resolve(Auth.User user, String id, ReportCommands.Resolution command) {
        if (Set.of("RESOLVED", "REJECTED").contains(command.status()) && command.response().strip().length() < 5) {
            throw new ApiError(400, "처리 결과를 5자 이상 남겨 주세요.");
        }
        if (reports.resolve(id, command) == 0) {
            throw new ApiError(409, "다른 담당자가 변경했습니다. 새로고침 후 확인해 주세요.");
        }
        reports.auditResolution(user, id, command.status());
    }

    public byte[] photo(String id) { return reports.photo(id); }
}
