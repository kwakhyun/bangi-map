package net.fieldtwin;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Instant;
class ParkingSyncTest {
 private final ObjectMapper json=new ObjectMapper();
 private ParkingSync.Observation parse(String capacity,String occupied,String time,String flag)throws Exception{
  var row=json.createObjectNode().put("PKLT_CD","1277145").put("TPKCT",capacity).put("NOW_PRK_VHCL_CNT",occupied).put("NOW_PRK_VHCL_UPDT_TM",time).put("PRK_STTS_YN",flag).put("CUR_PRK_CNT","999");
  var node=json.createObjectNode();var service=node.putObject("GetParkingInfo");service.putObject("RESULT").put("CODE","INFO-000");service.putArray("row").add(row);
  return ParkingSync.parse(node,Instant.parse("2026-10-11T12:00:00Z")).get("1277145");
 }
 @Test void calculatesRemainingFromOccupiedNotAmbiguousCityField()throws Exception{
  var p=parse("357","125","2026-10-11 21:00:00","1");assertEquals(232,p.available());assertEquals(Instant.parse("2026-10-11T12:00:00Z"),p.updatedAt());
 }
 @Test void acceptsProviderNumericDoublesButNotFractionalCars()throws Exception{
  for(String counts:new String[]{"192.0,55.0","28.0,0.0","28.0,28.0","28.0,1.5"}){
   var pair=counts.split(",");
   var node=json.readTree("{\"GetParkingInfo\":{\"RESULT\":{\"CODE\":\"INFO-000\"},\"row\":[{\"PKLT_CD\":\"1\",\"TPKCT\":"+pair[0]+",\"NOW_PRK_VHCL_CNT\":"+pair[1]+",\"PRK_STTS_YN\":\"1\",\"NOW_PRK_VHCL_UPDT_TM\":\"2026-10-11 21:00:00\"}]}}");
   var p=ParkingSync.parse(node,Instant.parse("2026-10-11T12:00:00Z")).get("1");
   if(pair[1].equals("1.5"))assertNull(p.available());else assertEquals((int)(Double.parseDouble(pair[0])-Double.parseDouble(pair[1])),p.available());
  }
 }
 @Test void fullAndEmptyLotsAreValid()throws Exception{
  assertEquals(0,parse("28","28","2026-10-11 21:00:00","1").available());
  assertEquals(28,parse("28","0","2026-10-11 21:00:00","1").available());
 }
 @Test void invalidCountsAreNotConvertedToZero()throws Exception{
  for(String occupied:new String[]{"","-1","29","1.5","null"})assertNull(parse("28",occupied,"2026-10-11 21:00:00","1").available());
  assertNull(parse("0","0","2026-10-11 21:00:00","1").available());
 }
 @Test void sourceClockCannotBeReplacedByFetchTime()throws Exception{
  assertEquals(Instant.parse("2026-10-11T10:00:00Z"),parse("28","10","2026-10-11 19:00:00","1").updatedAt());
  assertNull(parse("28","10","2026-10-11 22:00:00","1").available());
  assertNull(parse("28","10","2026-02-30 21:00:00","1").available());
  assertNull(parse("28","10","","1").available());
 }
 @Test void inactiveFeedAndProviderErrorAreNotLive()throws Exception{
  assertNull(parse("28","10","2026-10-11 21:00:00","0").available());
  assertThrows(IllegalArgumentException.class,()->ParkingSync.parse(json.readTree("{\"RESULT\":{\"CODE\":\"ERROR-300\"}}"),Instant.now()));
 }
}
