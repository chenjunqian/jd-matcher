# JD Matcher Project Documentation

## Project Overview

JD Matcher is an intelligent job matching tool built on the GoFrame framework that leverages LLM (Large Language Model) capabilities to find the most suitable jobs based on user resumes and job descriptions. The project provides services through a Telegram bot, automatically crawling job listings and notifying users when matching positions are found.

### Core Technology Stack

- **Backend Framework**: GoFrame v2.8.1
- **Database**: PostgreSQL (with pgvector extension for vector search)
- **LLM Integration**: OpenAI GPT-4o-mini and DeepSeek
- **Messaging Service**: Telegram Bot API
- **Web Crawling**: Custom crawler service supporting RemoteOK and WeWorkRemotely
- **Containerization**: Docker support

## Project Architecture

```txt
jd-matcher/
├── internal/
│   ├── cmd/           # Command line entry and server startup lf
│   ├── controller/    # Controller layer (reserved)
│   ├── dao/           # Data Access Object layer
│   ├── model/         # Data model definitions
│   ├── service/       # Business logic layer
│   │   ├── crawler/   # Job crawler service
│   │   ├── jobs/      # Scheduled task service
│   │   ├── llm/       # LLM client and vector service
│   │   └── telegram/  # Telegram bot service
│   └── packed/        # Resource packing
├── manifest/          # Configuration files and deployment manifests
├── resource/          # Static resources and templates
└── utility/           # Utility functions
```

## Core Features

### 1. Job Crawling

- **RemoteOK**: Crawls remote work job information
- **WeWorkRemotely**: Parses RSS format job data
- Supports scheduled crawling and incremental updates

### 2. Intelligent Matching

- Uses OpenAI text-embedding-ada-002 to generate vector representations of jobs and resumes
- Performs matching based on vector similarity calculations
- Supports custom matching strategies and thresholds

### 3. Telegram Bot

- User resume upload and management
- Matching results display and interaction
- Supports command-line operations and callback handling

### 4. Scheduled Tasks

- Job crawling tasks
- Vector embedding tasks
- Matching calculation tasks
- User notification tasks

## Building and Running

### Environment Requirements

- Go 1.22+
- PostgreSQL 12+ (pgvector extension required)
- Docker (optional)

### Local Development

1. **Install Dependencies**

   ```bash
   go mod download
   ```

2. **Configuration File**
   - Copy `manifest/config/config.yaml.temp` to `manifest/config/config.yaml`
   - Fill in necessary configuration information (Telegram Bot Token, OpenAI API Key, etc.)

3. **Database Setup**

   ```bash
   # Start PostgreSQL container
   cd manifest/config/database
   ./start_container.sh
   
   # Create database and table structure
   psql -h localhost -U jdmatcher -d jdmatcherdb -f schema.sql
   ```

4. **Run Application**

   ```bash
   # Using Makefile
   make build
   ./main
   
   # Or run directly
   go run main.go
   ```

### Docker Deployment

```bash
# Build image
docker build -t jd-matcher .

# Run container
docker run -p 8199:8199 jd-matcher
```

### Using Makefile

The project provides comprehensive Makefile support:

```bash
# Build project
make build

# Generate data access objects
make dao

# Generate service interfaces
make service

# Build Docker image
make image

# Deploy to Kubernetes
make deploy
```

## Development Conventions

### Code Structure

- Uses GoFrame's layered architecture pattern
- DAO layer handles database operations
- Service layer contains business logic
- Controller layer handles HTTP requests (reserved)

### Configuration Management

- Uses YAML format configuration files
- Supports environment variable overrides
- Sensitive information passed through environment variables

### Testing

- Unit test files end with `_test.go`
- Uses Go standard testing framework
- Mock testing uses `go.uber.org/mock`

### Logging

- Uses GoFrame built-in logging component
- Supports file and console output
- Configurable log levels

## Main Service Descriptions

### LLM Service (`internal/service/llm/`)

- Supports OpenAI and DeepSeek clients
- Provides text embedding and matching calculation functionality
- Includes prompt template management

### Crawler Service (`internal/service/crawler/`)

- Extensible crawler architecture
- Supports multiple data source formats
- Error handling and retry mechanisms

### Scheduled Tasks (`internal/service/jobs/`)

- Based on GoFrame's cron functionality
- Task registration and management
- Supports task status monitoring

### Telegram Service (`internal/service/telegram/`)

- Bot initialization and message handling
- Command and callback processing
- User message history management

## Database Schema

Main data tables:

- `user_info`: User information and resumes
- `job_detail`: Job detail information
- `user_matched_job`: User matching results

## Configuration Description

### Required Configuration Items

- `telegram.bot.token`: Telegram bot token
- `openai.apiKey`: OpenAI API key
- `database.default.link`: Database connection string

### Optional Configuration Items

- `openai.baseUrl`: Custom OpenAI API endpoint
- `server.address`: Server listening address
- `logger.*`: Log-related configuration

## Deployment Considerations

1. **Security**: Ensure API keys and sensitive information are passed through environment variables
2. **Database**: PostgreSQL needs pgvector extension installed
3. **Resources**: Application requires sufficient memory for vector calculations
4. **Monitoring**: Recommend configuring log collection and monitoring alerts

## Extension Development

### Adding New Job Sources

1. Create new crawler files in `internal/service/crawler/` directory
2. Implement crawler interface
3. Register scheduled tasks in `jobs/register.go`

### Adding New LLM Providers

1. Add client implementation in `internal/service/llm/` directory
2. Initialize client in `cmd/cmd.go`
3. Update configuration file template

### Adding New Telegram Commands

1. Define commands in `internal/service/telegram/command.go`
2. Implement corresponding handler functions
3. Update command list
