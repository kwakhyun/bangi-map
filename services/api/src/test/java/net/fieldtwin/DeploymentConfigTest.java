package net.fieldtwin;
import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;
import static org.junit.jupiter.api.Assertions.*;
class DeploymentConfigTest {
 private MockEnvironment safe(){return new MockEnvironment().withProperty("fieldtwin.environment","staging").withProperty("fieldtwin.demo","false").withProperty("fieldtwin.cookie-secure","true").withProperty("fieldtwin.allowed-origin","https://staging.example.test").withProperty("spring.datasource.password","a-random-deployment-test-password").withProperty("FIELD_TWIN_SERVICE_TOKEN","a-test-token-of-at-least-thirty-two-characters");}
 @Test void safeDeploymentStarts(){assertDoesNotThrow(()->new DeploymentConfig(safe()).validate());}
 @Test void stagingRefusesDemoAccounts(){assertThrows(IllegalStateException.class,()->new DeploymentConfig(safe().withProperty("fieldtwin.demo","true")).validate());}
 @Test void insecureCookiesAreRejected(){assertThrows(IllegalStateException.class,()->new DeploymentConfig(safe().withProperty("fieldtwin.cookie-secure","false")).validate());}
 @Test void insecureOriginIsRejected(){assertThrows(IllegalStateException.class,()->new DeploymentConfig(safe().withProperty("fieldtwin.allowed-origin","http://staging.example.test")).validate());}
 @Test void weakSecretsAreRejected(){assertThrows(IllegalStateException.class,()->new DeploymentConfig(safe().withProperty("spring.datasource.password","fieldtwin-local-only")).validate());}
}
