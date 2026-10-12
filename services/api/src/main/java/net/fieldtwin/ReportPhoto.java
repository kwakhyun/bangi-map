package net.fieldtwin;
import java.io.*;
import java.util.Base64;
import java.awt.image.BufferedImage;
import javax.imageio.ImageIO;
import java.util.concurrent.Semaphore;
import java.util.function.Supplier;
public final class ReportPhoto {
    // A decoded 16 MP image can consume tens of MB on the 1 GB staging server.
    private static final Semaphore DECODING = new Semaphore(1);
    private ReportPhoto() {}
    public static byte[] clean(String input){
        if(input==null||input.isBlank())return null;
        return withDecodePermit(() -> decode(input));
    }
    static byte[] withDecodePermit(Supplier<byte[]> decoder) {
        if (!DECODING.tryAcquire()) throw new ApiError(429,"사진을 처리 중입니다. 잠시 후 다시 제보해 주세요.");
        try { return decoder.get(); }
        finally { DECODING.release(); }
    }
    private static byte[] decode(String input) {
        try {
            if(!input.startsWith("data:image/jpeg;base64,")&&!input.startsWith("data:image/png;base64,"))throw new IOException();
            byte[] raw=Base64.getDecoder().decode(input.substring(input.indexOf(',')+1));if(raw.length>2_000_000)throw new IOException();
            try(var stream=ImageIO.createImageInputStream(new ByteArrayInputStream(raw))){
                var readers=ImageIO.getImageReaders(stream);if(!readers.hasNext())throw new IOException();var reader=readers.next();
                try {reader.setInput(stream);int w=reader.getWidth(0),h=reader.getHeight(0);if(w<1||h<1||(long)w*h>16_000_000)throw new IOException();
                    var src=reader.read(0);double scale=Math.min(1,1200.0/Math.max(w,h));
                    var out=new BufferedImage(Math.max(1,(int)(w*scale)),Math.max(1,(int)(h*scale)),BufferedImage.TYPE_INT_RGB);
                    var g=out.createGraphics();g.setColor(java.awt.Color.WHITE);g.fillRect(0,0,out.getWidth(),out.getHeight());g.drawImage(src,0,0,out.getWidth(),out.getHeight(),null);g.dispose();
                    var bytes=new ByteArrayOutputStream();ImageIO.write(out,"jpeg",bytes);return bytes.toByteArray();
                }finally{reader.dispose();}
            }
        }catch(Exception e){throw new ApiError(400,"사진은 2MB 이하의 JPEG/PNG이며 1,600만 화소 이하여야 합니다.");}
    }
}
