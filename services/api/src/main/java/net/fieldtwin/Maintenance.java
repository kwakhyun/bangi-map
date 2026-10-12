package net.fieldtwin;

import org.flywaydb.core.Flyway;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import java.sql.DriverManager;
import java.util.Locale;
import java.util.UUID;

/** One-shot maintenance commands; never start HTTP, schedulers, or demo seeding. */
final class Maintenance {
    private static String required(String key) {
        String value=System.getenv(key);
        if(value==null || value.isBlank()) throw new IllegalStateException("Missing "+key);
        return value;
    }
    static void migrate() {
        Flyway.configure().dataSource(required("DATABASE_URL"),required("DATABASE_USER"),required("DATABASE_PASSWORD"))
            .locations("classpath:db/migration").cleanDisabled(true).load().migrate();
    }
    static void bootstrap() throws Exception {
        String email=required("BOOTSTRAP_EMAIL").strip().toLowerCase(Locale.ROOT);
        String password=required("BOOTSTRAP_PASSWORD");
        if(!email.matches("[^\\s@]+@[^\\s@]+\\.[^\\s@]+") || password.length()<20 || password.length()>64)
            throw new IllegalStateException("Invalid initial account credentials");
        // The initial workspace is deliberately empty. Add real assets using the import flow.
        try(var conn=DriverManager.getConnection(required("DATABASE_URL"),required("DATABASE_USER"),required("DATABASE_PASSWORD"))) {
            conn.setAutoCommit(false);
            try {
                try(var lock=conn.createStatement()){lock.execute("SELECT pg_advisory_xact_lock(731206)");}
                try(var check=conn.createStatement();var rows=check.executeQuery("SELECT count(*) FROM tenants")) {
                    rows.next();if(rows.getLong(1)!=0)throw new IllegalStateException("Bootstrap requires an empty workspace");
                }
                try(var q=conn.prepareStatement("INSERT INTO tenants(id,name) VALUES('fieldtwin',?)")) {
                    q.setString(1,required("BOOTSTRAP_WORKSPACE"));q.executeUpdate();
                }
                double longitude=Double.parseDouble(required("BOOTSTRAP_LONGITUDE")),latitude=Double.parseDouble(required("BOOTSTRAP_LATITUDE"));
                if(!Double.isFinite(longitude)||!Double.isFinite(latitude)||Math.abs(longitude)>180||Math.abs(latitude)>90)throw new IllegalStateException("Invalid site coordinates");
                try(var q=conn.prepareStatement("INSERT INTO sites(id,tenant_id,name,address,longitude,latitude) VALUES('primary','fieldtwin',?,'미등록',?,?)")) {
                    q.setString(1,required("BOOTSTRAP_SITE"));q.setDouble(2,longitude);q.setDouble(3,latitude);q.executeUpdate();
                }
                try(var q=conn.prepareStatement("INSERT INTO users(id,tenant_id,site_id,name,email,role,password_hash) VALUES(?,'fieldtwin','primary',?,?,'ADMIN',?)")) {
                    q.setString(1,UUID.randomUUID().toString());q.setString(2,required("BOOTSTRAP_NAME"));q.setString(3,email);q.setString(4,new BCryptPasswordEncoder(12).encode(password));q.executeUpdate();
                }
                conn.commit();System.out.println("Initial workspace created. Credentials are not logged.");
            } catch(Exception e) {conn.rollback();throw e;}
        }
    }
}
