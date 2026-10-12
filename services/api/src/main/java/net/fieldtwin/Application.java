package net.fieldtwin;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
public class Application {
    public static void main(String[] args) throws Exception {
        if (args.length == 1 && args[0].equals("--migrate")) { Maintenance.migrate(); return; }
        if (args.length == 1 && args[0].equals("--bootstrap")) { Maintenance.bootstrap(); return; }
        SpringApplication.run(Application.class, args);
    }
}
