# Build stage. Pinned to the same Go the module declares, so the image cannot
# drift from what the tests ran against.
FROM golang:1.23-alpine AS build

WORKDIR /src

# Dependencies first: this layer is cached until go.mod itself changes.
COPY go.mod ./
RUN go mod download

COPY . .

# CGO off and a static binary, because the final image has no libc to link
# against. -trimpath keeps build paths out of the binary; -s -w drop the symbol
# table, which is dead weight in a container.
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/api ./cmd/api

# Runtime stage: distroless static — no shell, no package manager, no libc.
# Nothing to exploit and nothing to keep patched. The image is a few megabytes,
# almost all of it the binary.
FROM gcr.io/distroless/static-debian12:nonroot

COPY --from=build /out/api /api

# Unprivileged by default, so a container escape starts from nothing.
USER nonroot:nonroot
EXPOSE 8080

# No curl or wget exists here, so the binary probes itself.
HEALTHCHECK --interval=10s --timeout=3s --start-period=3s --retries=3 \
  CMD ["/api", "-healthcheck"]

ENTRYPOINT ["/api"]
