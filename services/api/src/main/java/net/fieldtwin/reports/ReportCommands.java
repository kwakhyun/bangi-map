package net.fieldtwin.reports;

import jakarta.validation.constraints.*;

public final class ReportCommands {
    private ReportCommands() {}

    public record Submission(
            @NotBlank String placeId,
            @Pattern(regexp="INFO|BROKEN|ACCESS|OTHER") @NotNull String category,
            @NotBlank @Size(min=5, max=1000) String description,
            @Pattern(regexp="[a-zA-Z0-9_-]{20,80}") @NotNull String requestKey,
            @Pattern(regexp="[a-zA-Z0-9_-]{32,100}") @NotNull String receiptToken,
            @Size(max=2800000) String photo) {}

    public record SubmissionResult(String id, boolean duplicate) {}

    public record Resolution(
            @Pattern(regexp="RECEIVED|REVIEWING|RESOLVED|REJECTED") @NotNull String status,
            @Size(max=1000) @NotNull String response,
            @Min(1) int version) {}
}
