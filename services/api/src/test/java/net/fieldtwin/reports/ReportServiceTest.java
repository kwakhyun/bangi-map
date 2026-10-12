package net.fieldtwin.reports;

import net.fieldtwin.ApiError;
import net.fieldtwin.Auth;
import net.fieldtwin.places.PlaceRepository;
import org.junit.jupiter.api.Test;
import java.util.Map;
import java.util.Optional;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class ReportServiceTest {
    private final ReportRepository reports = mock(ReportRepository.class);
    private final PlaceRepository places = mock(PlaceRepository.class);
    private final ReportService service = new ReportService(reports, places);
    private final ReportCommands.Submission command = new ReportCommands.Submission(
            "bike-1268", "INFO", "테스트 시설 정보입니다.", "request-key-for-regression", "receipt-token-for-regression-test", null);

    @Test void receiptDoesNotExposeOrMutateStoredHash() {
        var stored = Map.<String, Object>of("id", "report", "receiptHash", Auth.digest("token"));
        when(reports.receipt("report")).thenReturn(Optional.of(stored));
        assertEquals(Map.of("id", "report"), service.receipt("report", "token"));
        assertTrue(stored.containsKey("receiptHash"));
        assertEquals(404, assertThrows(ApiError.class, () -> service.receipt("report", "wrong")).status);
        assertEquals(404, assertThrows(ApiError.class, () -> service.receipt("report", null)).status);
    }

    @Test void retryKeepsExistingHashContractAndDoesNotSpendQuota() {
        String hash = Auth.digest("bike-1268\nINFO\n테스트 시설 정보입니다.\n");
        when(reports.prior(command.requestKey())).thenReturn(Optional.of(Map.of(
                "id", command.requestKey(), "requestHash", hash, "receiptHash", Auth.digest(command.receiptToken()))));
        assertTrue(service.submit(command, "peer").duplicate());
        verify(reports, never()).incrementDailyCount(anyString());
        verify(reports, never()).insert(any(), anyString(), anyString(), any());
        var conflicting = new ReportCommands.Submission(command.placeId(), command.category(), command.description(),
                command.requestKey(), "different-receipt-token", null);
        assertEquals(409, assertThrows(ApiError.class, () -> service.submit(conflicting, "peer")).status);
    }

    @Test void invalidPhotoDoesNotConsumeQuota() {
        when(reports.prior(anyString())).thenReturn(Optional.empty());
        var invalid = new ReportCommands.Submission(command.placeId(), command.category(), command.description(),
                command.requestKey(), command.receiptToken(), "data:image/png;base64,aW52YWxpZA==");
        assertEquals(400, assertThrows(ApiError.class, () -> service.submit(invalid, "peer")).status);
        verify(reports, never()).incrementDailyCount(anyString());
    }

    @Test void terminalResolutionNeedsExplanationAndStaleVersionIsRejected() {
        assertEquals(400, assertThrows(ApiError.class,
                () -> service.resolve(null, "report", new ReportCommands.Resolution("RESOLVED", "짧음", 1))).status);
        assertEquals(409, assertThrows(ApiError.class,
                () -> service.resolve(null, "report", new ReportCommands.Resolution("REVIEWING", "확인 중입니다", 1))).status);
        verify(reports, never()).auditResolution(any(), anyString(), anyString());
    }
}
