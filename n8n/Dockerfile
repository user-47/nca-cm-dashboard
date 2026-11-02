# n8n plus the media tools the pipelines shell out to.
#
# The n8n image is a hardened Alpine with no package manager, so nothing can be
# installed with apk. Everything arrives by copying from other images:
#   - ffmpeg/ffprobe as single static binaries, no dependencies to chase
#   - curl and openssl as Alpine binaries plus the shared libraries they need
#
# Versions are pinned. A silent base-image bump is the kind of thing that turns
# a working render into a 2am mystery.

# Stage 1: curl and openssl, from a normal Alpine that still has apk.
FROM alpine:3.22 AS tools
RUN apk add --no-cache curl openssl

# Stage 2: static ffmpeg. Self-contained, so it needs no library copying.
FROM mwader/static-ffmpeg:7.1 AS ffmpeg

FROM docker.n8n.io/n8nio/n8n:2.10.4

USER root

COPY --from=ffmpeg /ffmpeg /usr/local/bin/ffmpeg
COPY --from=ffmpeg /ffprobe /usr/local/bin/ffprobe

COPY --from=tools /usr/bin/curl /usr/bin/curl
COPY --from=tools /usr/bin/openssl /usr/bin/openssl
# curl is dynamically linked, so its libraries have to come along too.
COPY --from=tools /usr/lib/libcurl.so.4 /usr/lib/
COPY --from=tools /usr/lib/libnghttp2.so.14 /usr/lib/
COPY --from=tools /usr/lib/libidn2.so.0 /usr/lib/
COPY --from=tools /usr/lib/libpsl.so.5 /usr/lib/
COPY --from=tools /usr/lib/libssl.so.3 /usr/lib/
COPY --from=tools /usr/lib/libcrypto.so.3 /usr/lib/
COPY --from=tools /usr/lib/libunistring.so.5 /usr/lib/
COPY --from=tools /usr/lib/libz.so.1 /usr/lib/

# The render script writes here. On a fresh install the pipeline-work volume
# mounts empty and root-owned, so without this the script cannot create its own
# working directory and every render fails on a permission error.
RUN mkdir -p /data/work /data/jobs /data/out \
 && chown -R node:node /data \
 && chmod 755 /usr/local/bin/ffmpeg /usr/local/bin/ffprobe

USER node
