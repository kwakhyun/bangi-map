package net.fieldtwin;

import jakarta.annotation.PostConstruct;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;
import java.net.URI;
import java.util.Set;

/** Refuse unsafe defaults before a staging or production service starts. */
@Component
public class DeploymentConfig {
    private final Environment env;
    public DeploymentConfig(Environment env) { this.env = env; }
    @PostConstruct void validate() {
        String mode=env.getProperty("fieldtwin.environment", "local");
        if (!Set.of("local","staging","production").contains(mode)) throw new IllegalStateException("Invalid FIELD_TWIN_ENV");
        if (mode.equals("local")) return;
        if (env.getProperty("fieldtwin.demo", Boolean.class, true)) throw new IllegalStateException("Demo accounts are forbidden outside local");
        if (!env.getProperty("fieldtwin.cookie-secure", Boolean.class, false)) throw new IllegalStateException("Secure cookies are required");
        URI origin=URI.create(env.getRequiredProperty("fieldtwin.allowed-origin"));
        if (!"https".equals(origin.getScheme()) || origin.getHost()==null || origin.getRawUserInfo()!=null || origin.getRawQuery()!=null || origin.getRawFragment()!=null || (origin.getPath()!=null&&!origin.getPath().isEmpty())) throw new IllegalStateException("ALLOWED_ORIGIN must be an HTTPS origin without path");
        String password=env.getProperty("spring.datasource.password", "");
        if (password.length()<20 || password.contains("local-only")) throw new IllegalStateException("A strong deployment database secret is required");
        String token=env.getProperty("FIELD_TWIN_SERVICE_TOKEN", "");
        if (token.length()<32) throw new IllegalStateException("FIELD_TWIN_SERVICE_TOKEN must contain at least 32 characters");
    }
}
