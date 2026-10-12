package net.fieldtwin;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.awt.image.BufferedImage;
import javax.imageio.ImageIO;
import java.io.*;
import java.util.Base64;
class BangiUnitTest {
 @Test void bikeZeroAndMissingAreDifferent() throws Exception {
  var result=BikeSync.parse(new ObjectMapper().readTree("{\"rentBikeStatus\":{\"RESULT\":{\"CODE\":\"INFO-000\"},\"row\":[{\"stationName\":\"1268. 몽촌토성역\",\"parkingBikeTotCnt\":\"0\"},{\"stationName\":\"1200. 다른 역\",\"parkingBikeTotCnt\":\"\"},{\"stationName\":\"1201. 오류\",\"parkingBikeTotCnt\":\"-1\"}]}}"));
  assertEquals(0,result.get("1268"));assertFalse(result.containsKey("1200"));assertFalse(result.containsKey("1201"));
 }
 @Test void rejectProviderError() throws Exception {var json=new ObjectMapper().readTree("{\"RESULT\":{\"CODE\":\"ERROR-300\"}}");assertThrows(IllegalArgumentException.class,()->BikeSync.parse(json));}
 @Test void photoIsNormalizedAndInvalidInputRejected() throws Exception {
  var out=new ByteArrayOutputStream();ImageIO.write(new BufferedImage(1500,800,BufferedImage.TYPE_INT_RGB),"png",out);
  var image=ImageIO.read(new ByteArrayInputStream(ReportPhoto.clean("data:image/png;base64,"+Base64.getEncoder().encodeToString(out.toByteArray()))));
  assertEquals(1200,image.getWidth());assertEquals(640,image.getHeight());
  assertThrows(ApiError.class,()->ReportPhoto.clean("data:image/svg+xml;base64,PHN2Zz48L3N2Zz4="));
  assertThrows(ApiError.class,()->ReportPhoto.clean("data:image/png;base64,aW52YWxpZA=="));
  assertNull(ReportPhoto.clean(null));
 }
}
