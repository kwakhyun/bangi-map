package net.fieldtwin;

import org.springframework.web.bind.annotation.*;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.dao.DataIntegrityViolationException;
import java.util.Map;

@RestControllerAdvice
public class Errors {
    @ExceptionHandler(ApiError.class) ResponseEntity<?> api(ApiError e) {return ResponseEntity.status(e.status).body(Map.of("error",e.getMessage()));}
    @ExceptionHandler({MethodArgumentNotValidException.class,IllegalArgumentException.class,org.springframework.http.converter.HttpMessageNotReadableException.class})
    ResponseEntity<?> validation(Exception e) {return ResponseEntity.badRequest().body(Map.of("error","입력값의 형식과 필수 항목을 확인해 주세요."));}
    @ExceptionHandler(DataIntegrityViolationException.class) ResponseEntity<?> conflict(Exception e) {return ResponseEntity.status(409).body(Map.of("error","중복되거나 다른 데이터와 충돌하는 요청입니다."));}
    @ExceptionHandler(org.springframework.web.multipart.MaxUploadSizeExceededException.class) ResponseEntity<?> tooLarge(Exception e) {return ResponseEntity.status(413).body(Map.of("error","파일은 10MB 이하여야 합니다."));}
}
