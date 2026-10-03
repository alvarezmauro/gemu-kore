# Community images are no longer available; build the pinned upstream release.
FROM golang:1.26.8-bookworm@sha256:a688600ca24f8a4d3ca77f95b0dd40704a9fc787c826660eb7ba0b641b8b175d AS build
RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    CGO_ENABLED=0 go install -trimpath github.com/minio/minio@9e49d5e7a648f00e26f2246f4dc28e6b07f8c84a \
    && mkdir /licenses \
    && cp /go/pkg/mod/github.com/minio/minio@*/LICENSE /licenses/LICENSE

FROM debian:bookworm-slim@sha256:3783cc01769c7b2b1b83a5c5ad96c815348e28ed7da68e2e3687004faa906251
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir /data && chown 10001:10001 /data
COPY --from=build /go/bin/minio /usr/local/bin/minio
COPY --from=build /licenses/LICENSE /usr/share/licenses/minio/LICENSE
LABEL org.opencontainers.image.source="https://github.com/minio/minio" \
      org.opencontainers.image.revision="9e49d5e7a648f00e26f2246f4dc28e6b07f8c84a"
ENV HOME=/tmp
USER 10001:10001
EXPOSE 9000 9001
ENTRYPOINT ["minio"]
CMD ["server", "/data", "--console-address", ":9001"]
