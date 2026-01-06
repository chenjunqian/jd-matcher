# JD Matcher Project Documentation

## Project Overview

JD Matcher is an intelligent job matching tool built with the GoFrame framework, leveraging Large Language Model (LLM) capabilities to find the most suitable jobs based on user resumes and job descriptions. The project provides services through a Telegram bot, automatically crawling job listings and notifying users when matching positions are found.

### Tech Stack

- **Backend Framework**: GoFrame v2.8.1
- **Database**: PostgreSQL (with pgvector extension for vector search)
- **LLM Integration**: OpenAI (GPT-4o-mini, text-embedding-ada-002) and DeepSeek
- **Messaging Service**: Telegram Bot API
- **Web Crawler**: Custom crawler service supporting RemoteOK and WeWorkRemotely
- **Containerization**: Docker support
- **Dependency Injection**: go.uber.org/mock (for testing)

## Project Architecture

```
jd-matcher/
├── internal/
│   ├── cmd/           # Command line entry and server startup
│   ├── consts/        # Constant definitions
│   ├── controller/    # Controller layer (retained)
│   ├── dao/           # Data Access Object layer
│   ├── model/         # Data model definitions
│   │   ├── dto/       # Data Transfer Objects
│   │   └── entity/    # Entity definitions
│   ├── service/       # Business Logic layer
│   │   ├── crawler/   # Job crawler service
│   │   ├── jobs/      # Scheduled task service
│   │   ├── llm/       # LLM client and vector service
│   │   └── telegram/  # Telegram bot service
│   │       ├── all_jobs/      # View all jobs command
│   │       ├── expectation/   # Set expectations command
│   │       ├── help/          # Help command
│   │       ├── jobs/          # Match jobs command
│   │       ├── start/         # Start command
│   │       └── upload_resume/ # Upload resume command
│   └── packed/        # Resource packing
├── manifest/          # Configuration files and deployment manifests
│   ├── config/        # Application configuration
│   └── i18n/          # Internationalization resources
├── resource/          # Static resources and templates
│   ├── prompt/        # Prompt templates
│   ├── public/        # Public resources
│   └── template/      # Template files
└── utility/           # Utility functions
```

## Core Features

### 1. Job Crawling

- **RemoteOK**: Crawls remote job position information
- **WeWorkRemotely**: Parses RSS-formatted job data
- Supports scheduled crawling and incremental updates

### 2. Intelligent Matching

- Uses OpenAI text-embedding-ada-002 to generate vector representations of jobs and resumes
- Performs matching based on vector similarity calculation
- Supports custom matching strategies and thresholds

### 3. Telegram Bot

- User resume upload and management
- Matched results display and interaction
- Supports command operations and callback handling
- **New Feature**: Set job expectations (location, salary, language, work style)

### 4. Scheduled Tasks

- Job crawling tasks
- Vector embedding tasks
- Matching calculation tasks
- User notification tasks

## Building and Running

### Environment Requirements

- Go 1.22+
- PostgreSQL 12+ (requires pgvector extension)
- Docker (optional)

### Local Development

1. **Install Dependencies**

   ```bash
   go mod download
   ```

2. **Configuration File**
   - Copy `manifest/config/config.yaml.temp` to `manifest/config/config.yaml`
   - Fill in the required configuration (Telegram Bot Token, OpenAI API Key, etc.)

3. **Database Setup**

   ```bash
   # Start PostgreSQL container
   cd manifest/config/database
   ./start_container.sh
   
   # Create database and schema
   psql -h localhost -U jdmatcher -d jdmatcherdb -f schema.sql
   ```

4. **Run the Application**

   ```bash
   # First, pack resource files
   gf pack resource internal/packed/packed.go -y
   
   # Build and run
   go build -o main .
   ./main
   
   # Or run directly
   go run main.go
   ```

### Docker Deployment

```bash
# Build image
docker build -t jd-matcher .

# Run container
docker run -p 8199:8199 \
  -e LLM_OPENAI_APIKEY="your_openai_key" \
  -e LLM_OPENAI_BASEURL="https://api.openai.com/v1" \
  -e LLM_OPENAI_MODEL="gpt-4o-mini" \
  -e LLM_OPENAI_EMBEDDINGMODEL="text-embedding-ada-002" \
  -e TELEGRAM_BOT_TOKEN="your_telegram_token" \
  -e DATABASE_DEFAULT_LINK="postgres://user:pass@host:5432/db" \
  jd-matcher
```

## Development Standards

### Code Structure

- Use GoFrame's layered architecture pattern
- DAO layer handles database operations
- Service layer contains business logic
- Controller layer handles HTTP requests (retained)

### Configuration Management

- Use YAML format configuration files
- Support environment variable overrides
- Pass sensitive information via environment variables
- Environment variable prefix rules:
  - Telegram: `TELEGRAM_BOT_TOKEN`
  - OpenAI: `LLM_OPENAI_XXX`
  - DeepSeek: `LLM_DEEPSEEK_XXX`
  - Database: `DATABASE_DEFAULT_XXX`

### Testing

- Unit test files end with `_test.go`
- Use Go's standard testing framework
- Mock testing uses `go.uber.org/mock`

### Logging

- Use GoFrame's built-in logging component
- Support file and console output
- Configurable log levels

## Main Service Descriptions

### LLM Service (`internal/service/llm/`)

- Supports OpenAI and DeepSeek clients
- Provides text embedding and matching calculation functions
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
- Command and callback handling
- User message history management

## Database Schema

Main tables:

- `user_info`: User information and resume
- `job_detail`: Detailed job information
- `user_matched_job`: User matching results

## Configuration Guide

### Required Configuration Items

- `telegram.bot.token`: Telegram bot token
- `openai.apiKey`: OpenAI API key
- `database.default.link`: Database connection string

### Optional Configuration Items

- `openai.baseUrl`: Custom OpenAI API endpoint
- `openai.model`: OpenAI model name (default: gpt-4o-mini)
- `openai.embeddingModel`: Embedding model name (default: text-embedding-ada-002)
- `deepseek.model`: DeepSeek model name
- `deepseek.baseUrl`: DeepSeek API endpoint
- `deepseek.apiKey`: DeepSeek API key
- `server.address`: Server listening address
- `logger.*`: Log-related configuration

## Deployment Notes

1. **Security**: Ensure API keys and sensitive information are passed via environment variables
2. **Database**: PostgreSQL requires pgvector extension
3. **Resources**: Application needs sufficient memory for vector calculations
4. **Monitoring**: Recommend configuring log collection and monitoring alerts

## Extending Development

### Adding New Job Sources

1. Create a new crawler file in `internal/service/crawler/`
2. Implement the crawler interface
3. Register the scheduled task in `jobs/register.go`

### Adding New LLM Providers

1. Add client implementation in `internal/service/llm/`
2. Initialize the client in `cmd/cmd.go`
3. Update the configuration file template

### Adding New Telegram Commands

1. Define the command in `internal/service/telegram/command.go`
2. Implement the corresponding handler function
3. Update the command list and help information

## Telegram Bot Commands

| Command | Description |
|---------|-------------|
| `/start` | Start the bot, begin your job search journey |
| `/help` | Get bot usage help |
| `/all_jobs` | Get all available jobs |
| `/jobs` | Get jobs matched for you |
| `/upload_resume` | Upload your resume |
| `/expectation` | Set job expectations (location, salary, language, work style) |
