package net.fieldtwin;
import org.springframework.boot.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
@Component
public class DemoSeed implements ApplicationRunner {
 private final Db db;
 @Value("${fieldtwin.demo}") boolean demo;
 public DemoSeed(Db db){this.db=db;}
 @Override @Transactional public void run(ApplicationArguments args){
  if(!demo)return;
  db.jdbc.execute("SELECT pg_advisory_xact_lock(731205)");
  if(db.jdbc.queryForObject("SELECT count(*) FROM tenants WHERE id='fieldtwin'",Integer.class)>0)return;
  db.update("INSERT INTO tenants VALUES('fieldtwin','방이 생활지도')");
  db.update("INSERT INTO sites VALUES('primary','fieldtwin','방이 생활권','서울특별시 송파구 방이동과 인접 지역',127.118,37.514)");
  db.update("INSERT INTO users(id,tenant_id,email,name,role,site_id,password_hash) VALUES('bangi-local-admin','fieldtwin','admin@bangi.local','운영자','ADMIN','primary',?)",Auth.passwordHash("BangiLocal!2026"));
 }
}
