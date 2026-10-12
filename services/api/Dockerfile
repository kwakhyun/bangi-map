FROM --platform=$BUILDPLATFORM maven:3.9.11-eclipse-temurin-17 AS build
WORKDIR /build
COPY services/api/pom.xml ./pom.xml
COPY services/api/src ./src
RUN --mount=type=cache,target=/root/.m2 mvn -B -q package -DskipTests
FROM eclipse-temurin:17-jre
ARG SOURCE_REVISION=local
LABEL org.opencontainers.image.source="https://github.com/kwakhyun/bangi-map" org.opencontainers.image.revision=$SOURCE_REVISION
ENV APP_REVISION=$SOURCE_REVISION
RUN useradd --system --uid 10001 --create-home app
WORKDIR /app
COPY --from=build /build/target/*.jar app.jar
USER 10001
ENV API_BIND=0.0.0.0 API_PORT=8080 JAVA_TOOL_OPTIONS="-Djava.awt.headless=true -XX:MaxRAMPercentage=70"
EXPOSE 8080
ENTRYPOINT ["java","-jar","app.jar"]
