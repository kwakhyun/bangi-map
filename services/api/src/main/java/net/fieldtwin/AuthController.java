package net.fieldtwin;
import jakarta.servlet.http.*;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.beans.factory.annotation.Value;
import java.util.Map;

@RestController
@RequestMapping("/api")
public class AuthController {
    private final Auth auth;
    @Value("${fieldtwin.demo}") boolean demo;
    @Value("${fieldtwin.environment}") String environment;
    public AuthController(Auth auth){this.auth=auth;}
    record Login(@NotBlank @Email @Size(max=200) String email,@NotBlank @Size(max=200) String password){}
    @GetMapping("/config") Map<String,Object> config(){return Map.of("demo",demo,"name","방이 생활지도","version","0.6.2","environment",environment);}
    @PostMapping("/auth/login") Auth.User login(@Valid @RequestBody Login b,HttpServletRequest req,HttpServletResponse res){return auth.login(b.email(),b.password(),req,res);}
    @GetMapping("/auth/me") Auth.User me(HttpServletRequest req){return auth.user(req);}
    @PostMapping("/auth/logout") Map<String,Object> logout(HttpServletRequest req,HttpServletResponse res){auth.logout(req,res);return Map.of("ok",true);}
    record Password(@NotBlank @Size(max=200) String currentPassword,@NotBlank @Size(min=12,max=64) String newPassword){}
    @PostMapping("/auth/password") Map<String,Object> password(@Valid @RequestBody Password b,HttpServletRequest req,HttpServletResponse res){auth.changePassword(b.currentPassword(),b.newPassword(),req,res);return Map.of("ok",true);}
}
