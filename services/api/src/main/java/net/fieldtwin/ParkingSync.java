package net.fieldtwin;

import org.springframework.stereotype.Component;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import com.fasterxml.jackson.databind.JsonNode;
import java.net.URI;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.net.http.*;
import java.time.*;
import java.time.format.DateTimeFormatter;
import java.util.*;

@Component
public class ParkingSync {
    private final Db db; private final TransactionTemplate transaction;
    private final HttpClient client=HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(8)).followRedirects(HttpClient.Redirect.NEVER).build();
    @Value("${SEOUL_API_KEY:}") String key;
    @Value("${SEOUL_BIKE_API_BASE:https://openapi.seoul.go.kr:8088}") String base;
    public ParkingSync(Db db,PlatformTransactionManager manager){this.db=db;transaction=new TransactionTemplate(manager);}
    public boolean configured(){return key!=null&&key.matches("[a-zA-Z0-9]{10,100}");}
    record Observation(Integer capacity,Integer occupied,Instant updatedAt){
        Integer available(){return capacity==null||occupied==null?null:capacity-occupied;}
    }
    private static Integer count(JsonNode node){
        // The provider serialises whole counts as JSON doubles (e.g. 192.0).
        try {
            int value=node.isNumber()?node.decimalValue().intValueExact():node.asText().matches("[0-9]{1,6}")?Integer.parseInt(node.asText()):-1;
            return value>=0&&value<=999999?value:null;
        }catch(ArithmeticException e){return null;}
    }
    static Map<String,Observation> parse(JsonNode node,Instant now){
        var service=node.path("GetParkingInfo");
        if(!service.path("RESULT").path("CODE").asText().equals("INFO-000")||!service.path("row").isArray())throw new IllegalArgumentException("Invalid provider result");
        Map<String,Observation> result=new HashMap<>();
        for(var row:service.path("row")){
            String id=row.path("PKLT_CD").asText();if(!id.matches("[0-9]{1,20}"))continue;
            Integer capacity=count(row.path("TPKCT")),occupied=count(row.path("NOW_PRK_VHCL_CNT"));
            Instant updated=null;
            try{updated=LocalDateTime.parse(row.path("NOW_PRK_VHCL_UPDT_TM").asText(),DateTimeFormatter.ofPattern("uuuu-MM-dd HH:mm:ss").withResolverStyle(java.time.format.ResolverStyle.STRICT)).atZone(ZoneId.of("Asia/Seoul")).toInstant();}catch(Exception ignored){}
            // Never infer availability from citydata.CUR_PRK_CNT (its documentation is ambiguous).
            if(!row.path("PRK_STTS_YN").asText().equals("1")||capacity==null||capacity<=0||occupied==null||occupied>capacity||updated==null||updated.isAfter(now.plusSeconds(120)))
                result.put(id,new Observation(null,null,null));
            else result.put(id,new Observation(capacity,occupied,updated));
        }
        return result;
    }
    @Scheduled(initialDelay=30000,fixedDelay=300000) public void sync(){
        if(!configured()||!Set.of("https://openapi.seoul.go.kr:8088","http://openapi.seoul.go.kr:8088").contains(base))return;
        db.update("UPDATE bangi_sources SET last_attempt_at=now() WHERE id='seoul-parking'");
        try{
            Map<String,Observation> observations=new HashMap<>();boolean complete=false;
            for(int start=1;start<=10000;start+=1000){
                String path="/"+key+"/json/GetParkingInfo/"+start+"/"+(start+999)+"/"+URLEncoder.encode("송파구",StandardCharsets.UTF_8);
                var response=client.send(HttpRequest.newBuilder(URI.create(base+path)).timeout(Duration.ofSeconds(15)).GET().build(),HttpResponse.BodyHandlers.ofString());
                if(response.statusCode()!=200||response.body().length()>4_000_000)throw new IllegalStateException();
                var node=db.json.readTree(response.body());
                if(start>1&&node.path("RESULT").path("CODE").asText().equals("INFO-200")){complete=true;break;}
                observations.putAll(parse(node,Instant.now()));
                if(node.path("GetParkingInfo").path("row").size()<1000){complete=true;break;}
            }
            if(!complete||observations.isEmpty())throw new IllegalStateException();
            transaction.executeWithoutResult(status->{
                int matched=0;
                for(var place:db.list("SELECT id,source_id FROM bangi_places WHERE kind='PARKING' AND active")){
                    var observation=observations.get(place.get("sourceId"));if(observation==null)continue;
                    matched+=db.update("UPDATE bangi_places SET live_supported=true,total_capacity=?,occupied=?,available=?,provider_updated_at=?,checked_at=now() WHERE id=?",observation.capacity(),observation.occupied(),observation.available(),observation.updatedAt()==null?null:java.sql.Timestamp.from(observation.updatedAt()),place.get("id"));
                }
                if(matched==0)throw new IllegalStateException();
                db.update("UPDATE bangi_sources SET status='READY',last_success_at=now(),message=? WHERE id='seoul-parking'",matched+"개 주차장의 연동 상태를 확인했습니다. 제공 시각과 현장 상황을 함께 확인해 주세요.");
            });
        }catch(Exception e){
            if(e instanceof InterruptedException)Thread.currentThread().interrupt();
            // Never log key-bearing URLs or provider exceptions. Retain old timestamps on failure.
            db.update("UPDATE bangi_sources SET status='ERROR',message='주차 현황 수집에 실패했습니다. 제공 시각을 확인해 주세요.' WHERE id='seoul-parking'");
        }
    }
}
