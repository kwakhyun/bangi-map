package net.fieldtwin;

import org.springframework.stereotype.Component;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import com.fasterxml.jackson.databind.JsonNode;
import java.net.URI;
import java.net.http.*;
import java.time.Duration;
import java.util.*;
import java.util.regex.Pattern;

@Component
public class BikeSync {
    private final Db db; private final TransactionTemplate transaction;
    private final HttpClient client=HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(8)).followRedirects(HttpClient.Redirect.NEVER).build();
    @Value("${SEOUL_API_KEY:}") String key;
    @Value("${SEOUL_BIKE_API_BASE:https://openapi.seoul.go.kr:8088}") String base;
    public BikeSync(Db db,PlatformTransactionManager manager){this.db=db;transaction=new TransactionTemplate(manager);}
    public boolean configured(){return key!=null&&key.matches("[a-zA-Z0-9]{10,100}");}
    static Map<String,Integer> parse(JsonNode node){
        var service=node.path("rentBikeStatus");
        if(!service.path("RESULT").path("CODE").asText().equals("INFO-000")||!service.path("row").isArray())throw new IllegalArgumentException("Invalid provider result");
        Map<String,Integer> result=new HashMap<>();
        for(var row:service.path("row")){
            var m=Pattern.compile("^\\s*(\\d+)\\.").matcher(row.path("stationName").asText());
            String count=row.path("parkingBikeTotCnt").asText();
            if(m.find()&&count.matches("\\d{1,5}"))result.put(m.group(1),Integer.parseInt(count));
        }
        return result;
    }
    @Scheduled(initialDelay=15000,fixedDelay=120000) public void sync(){
        if(!configured())return;
        // Fixed provider origins; never accept a user-controlled proxy or log a key-bearing URI.
        if(!Set.of("https://openapi.seoul.go.kr:8088","http://openapi.seoul.go.kr:8088").contains(base))return;
        db.update("UPDATE bangi_sources SET last_attempt_at=now() WHERE id='seoul-bike'");
        try {
            Map<String,Integer> counts=new HashMap<>();boolean complete=false;
            for(int start=1;start<=10000;start+=1000){
                var req=HttpRequest.newBuilder(URI.create(base+"/"+key+"/json/bikeList/"+start+"/"+(start+999)+"/")).timeout(Duration.ofSeconds(15)).GET().build();
                var response=client.send(req,HttpResponse.BodyHandlers.ofString());if(response.statusCode()!=200||response.body().length()>4_000_000)throw new IllegalStateException();
                var node=db.json.readTree(response.body());
                if(start>1&&node.path("RESULT").path("CODE").asText().equals("INFO-200")){complete=true;break;}
                counts.putAll(parse(node));
                // list_total_count is the returned page size, not the citywide total.
                if(node.path("rentBikeStatus").path("row").size()<1000){complete=true;break;}
            }
            if(!complete||counts.isEmpty())throw new IllegalStateException();
            transaction.executeWithoutResult(status->{
                int matched=0;
                for(var p:db.list("SELECT id,source_id FROM bangi_places WHERE kind='BIKE' AND active")){
                    Integer value=counts.get(p.get("sourceId"));
                    if(value!=null)matched+=db.update("UPDATE bangi_places SET available=?,checked_at=now() WHERE id=?",value,p.get("id"));
                }
                if(matched==0)throw new IllegalStateException();
                db.update("UPDATE bangi_sources SET status='READY',last_success_at=now(),message=? WHERE id='seoul-bike'",matched+"개 대여소의 최근 수집값입니다. 실제 현장과 차이가 날 수 있습니다.");
            });
        }catch(Exception e){
            if(e instanceof InterruptedException)Thread.currentThread().interrupt();
            db.update("UPDATE bangi_sources SET status='ERROR',message='수집에 실패했습니다. 마지막 수집 시각을 확인해 주세요.' WHERE id='seoul-bike'");
        }
    }
}
