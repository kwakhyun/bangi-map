package net.fieldtwin;

import jakarta.servlet.*;
import jakarta.servlet.http.*;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;
import java.io.IOException;
import java.util.UUID;

@Component
public class RequestMetadata extends OncePerRequestFilter {
    @Override protected void doFilterInternal(HttpServletRequest req,HttpServletResponse res,FilterChain chain) throws ServletException,IOException {
        String id=UUID.randomUUID().toString();
        req.setAttribute("requestId",id);
        res.setHeader("X-Request-Id",id);
        res.setHeader("X-Content-Type-Options","nosniff");
        res.setHeader("Cache-Control","no-store");
        chain.doFilter(req,res);
    }
}
