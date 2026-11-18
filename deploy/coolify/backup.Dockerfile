FROM alpine:3.23
ARG POSTGRES_MAJOR=18
RUN apk add --no-cache age ca-certificates curl flock "postgresql${POSTGRES_MAJOR}-client" rclone
ENV PATH="/usr/libexec/postgresql${POSTGRES_MAJOR}:${PATH}"
COPY backup.sh /usr/local/bin/sniptide-backup
RUN chmod 0755 /usr/local/bin/sniptide-backup
ENTRYPOINT ["/usr/local/bin/sniptide-backup"]
