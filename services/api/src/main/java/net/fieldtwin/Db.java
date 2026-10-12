package net.fieldtwin;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import java.sql.*;
import java.util.*;

@Component
public class Db {
    public final JdbcTemplate jdbc;
    public final ObjectMapper json;
    public Db(JdbcTemplate jdbc, ObjectMapper json) { this.jdbc=jdbc; this.json=json; }
    public List<Map<String,Object>> list(String sql, Object... args) {
        return jdbc.query(sql, (rs,n) -> {
            var row=new LinkedHashMap<String,Object>(); var meta=rs.getMetaData();
            for(int i=1;i<=meta.getColumnCount();i++) {
                Object value=rs.getObject(i); String type=meta.getColumnTypeName(i);
                if(value!=null && (type.equals("jsonb")||type.equals("json"))) value=parse(value.toString());
                else if(value instanceof Timestamp t) value=t.toInstant().toString();
                else if(value instanceof java.sql.Date d) value=d.toLocalDate().toString();
                row.put(camel(meta.getColumnLabel(i)),value);
            }
            return row;
        },args);
    }
    public Map<String,Object> one(String sql,Object... args) {
        var rows=list(sql,args); if(rows.isEmpty()) throw new ApiError(404,"요청한 데이터를 찾을 수 없습니다."); return rows.get(0);
    }
    public int update(String sql,Object... args) { return jdbc.update(sql,args); }
    public String encode(Object value) { try { return json.writeValueAsString(value); } catch(Exception e) {throw new IllegalArgumentException("Invalid JSON");} }
    public Object parse(String value) { try {return json.readValue(value,Object.class);} catch(Exception e) {throw new IllegalArgumentException("Invalid JSON");} }
    @SuppressWarnings("unchecked") public Map<String,Object> map(Object value) {return (Map<String,Object>)value;}
    public static String camel(String name) {
        var out=new StringBuilder(); boolean upper=false;
        for(char c:name.toCharArray()) {if(c=='_') upper=true;else {out.append(upper?Character.toUpperCase(c):c);upper=false;}} return out.toString();
    }
    public void audit(Auth.User u,String action,String id,Object detail) {
        update("INSERT INTO audit_events(tenant_id,user_id,action,object_id,detail) VALUES(?,?,?,?,?::jsonb)",u.tenantId(),u.id(),action,id,encode(detail));
    }
}
