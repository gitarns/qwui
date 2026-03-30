FROM node:20.19.5 AS npm-builder
WORKDIR /app
COPY frontend/package.json frontend/package-lock.json ./
RUN npm install
COPY frontend/ .
RUN npm run build

FROM golang:1.24-alpine AS go-builder
WORKDIR /app
RUN apk --no-cache add git make ca-certificates
ENV GOPROXY=direct
COPY go-backend/go.mod go-backend/go.sum ./
ENV GOCACHE=/go-cache
ENV GOMODCACHE=/gomod-cache
COPY go-backend/*.go ./
RUN --mount=type=cache,target=/gomod-cache --mount=type=cache,target=/go-cache \
    go build -ldflags "-w -s" -o ./qwui

FROM scratch AS production
COPY --from=npm-builder /app/dist/ /app/dist/
COPY --from=go-builder /app/qwui /app/
COPY --from=go-builder /etc/ssl /etc/ssl
WORKDIR /app
EXPOSE 8080
ENTRYPOINT ["/app/qwui"]
