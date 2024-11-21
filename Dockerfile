# First Stage: Builder
FROM golang:1.23.3-alpine AS builder

WORKDIR /app

RUN ls -l .
# Install wget and gf CLI
RUN apk add --no-cache wget
RUN wget -O gf https://github.com/gogf/gf/releases/latest/download/gf_linux_amd64 && chmod +x gf && ./gf install -y && rm ./gf

# Copy go.mod and go.sum files first
COPY go.mod go.sum ./
RUN ls -l .

# Download Go modules
RUN go mod download && go mod verify

# Copy the rest of the application files
COPY . /app
RUN ls -l .

# Build the application
RUN gf pack resource internal/packed/packed.go -y
RUN gf build

# Second Stage: Final Image
FROM alpine:3.8

# Install tzdata for timezone setting
RUN apk add --no-cache tzdata

# Set the timezone
ENV TZ="Asia/Shanghai"
RUN cp /usr/share/zoneinfo/Asia/Shanghai /etc/localtime && \
    echo "Asia/Shanghai" > /etc/timezone

WORKDIR /app
# Copy the built binary from the builder stage
COPY --from=builder /app/main /app/main
RUN ls -l .
# Ensure the binary has execute permissions
RUN chmod +x /app/main

# Run the application
CMD /app/main