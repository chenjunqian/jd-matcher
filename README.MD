# JD Matcher

[![Go Version](https://img.shields.io/badge/Go-1.22+-blue.svg)](https://golang.org)
[![GoFrame](https://img.shields.io/badge/GoFrame-v2.8.1-orange.svg)](https://goframe.org)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

JD Matcher is an intelligent job matching tool that leverages Large Language Model (LLM) capabilities to find the most suitable jobs based on user resumes and job descriptions. The project provides services through a Telegram bot, automatically crawling job listings and notifying users when matching positions are found.

## ✨ Features

- 🤖 **Intelligent Matching**: Uses OpenAI text-embedding-ada-002 to generate vector representations of jobs and resumes for accurate matching
- 📱 **Telegram Bot Integration**: User-friendly interface for resume upload, job search, and matching results
- 🕷️ **Automated Job Crawling**: Supports RemoteOK and WeWorkRemotely job sources with scheduled crawling
- 🔔 **Smart Notifications**: Automatically notifies users when matching jobs are found
- 🐳 **Docker Support**: Easy deployment with containerization
- ⚡ **High Performance**: Built on GoFrame framework with PostgreSQL and pgvector for efficient vector search

## 🏗️ Architecture

```txt
jd-matcher/
├── internal/
│   ├── cmd/           # Command line entry and server startup
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

## 🚀 Quick Start

### Prerequisites

- Go 1.22 or higher
- PostgreSQL 12+ with pgvector extension
- Docker (optional)
- Telegram Bot Token
- OpenAI API Key

### Installation

1. **Clone the repository**

   ```bash
   git clone https://github.com/chenjunqian/jd-matcher.git
   cd jd-matcher
   ```

2. **Install dependencies**

   ```bash
   go mod download
   ```

3. **Set up configuration**

   ```bash
   cp manifest/config/config.yaml.temp manifest/config/config.yaml
   ```

   Edit `manifest/config/config.yaml` and add your configuration:

   ```yaml
   telegram:
     bot:
       token: "YOUR_TELEGRAM_BOT_TOKEN"
   
   openai:
     apiKey: "YOUR_OPENAI_API_KEY"
     baseUrl: "https://api.openai.com/v1"  # optional
   
   database:
     default:
       link: "postgres://username:password@localhost:5432/jdmatcherdb?sslmode=disable"
   ```

4. **Set up database**

   ```bash
   # Start PostgreSQL container
   cd manifest/config/database
   ./start_container.sh
   
   # Create database and table structure
   psql -h localhost -U jdmatcher -d jdmatcherdb -f schema.sql
   ```

5. **Run the application**

   ```bash
   # Build and run
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
docker run -p 8199:8199 \
  -e TELEGRAM_BOT_TOKEN="your_token" \
  -e OPENAI_API_KEY="your_key" \
  jd-matcher
```

## 📖 Usage

### Telegram Bot Commands

- `/start` - Start the bot and see available commands
- `/upload` - Upload your resume
- `/myjobs` - View your matched jobs
- `/help` - Get help information

### How It Works

1. **Resume Upload**: Users upload their resumes through the Telegram bot
2. **Vector Embedding**: Resumes are converted to vector representations using OpenAI embeddings
3. **Job Crawling**: The system automatically crawls jobs from supported sources
4. **Matching**: Jobs are matched against user resumes using vector similarity
5. **Notifications**: Users are notified when matching jobs are found

## 🛠️ Development

### Project Structure

- **Crawler Service**: `internal/service/crawler/` - Job crawling implementations
- **LLM Service**: `internal/service/llm/` - LLM client and vector operations
- **Telegram Service**: `internal/service/telegram/` - Bot logic and message handling
- **Scheduled Jobs**: `internal/service/jobs/` - Background task management

### Adding New Job Sources

1. Create a new crawler in `internal/service/crawler/`
2. Implement the crawler interface
3. Register scheduled tasks in `internal/service/jobs/register.go`

### Adding New LLM Providers

1. Add client implementation in `internal/service/llm/`
2. Initialize client in `internal/cmd/cmd.go`
3. Update configuration file template

### Testing

```bash
# Run all tests
go test ./...

# Run tests with coverage
go test -cover ./...

# Run specific test
go test ./internal/service/crawler/remote_ok_test.go
```

### Build Tools

The project includes a comprehensive Makefile:

```bash
make build          # Build project
make dao           # Generate data access objects
make service       # Generate service interfaces
make image         # Build Docker image
make deploy        # Deploy to Kubernetes
```

## 📊 Configuration

### Required Environment Variables

- `TELEGRAM_BOT_TOKEN` - Telegram bot token
- `OPENAI_API_KEY` - OpenAI API key
- `DATABASE_URL` - PostgreSQL connection string

### Optional Configuration

- `OPENAI_BASE_URL` - Custom OpenAI API endpoint
- `SERVER_ADDRESS` - Server listening address
- `LOG_LEVEL` - Logging level configuration

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request. For major changes, please open an issue first to discuss what you would like to change.

### Development Guidelines

- Follow Go coding conventions
- Write unit tests for new features
- Update documentation as needed
- Use meaningful commit messages

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [GoFrame](https://goframe.org) - The Go framework used
- [OpenAI](https://openai.com) - For the embedding API
- [Telegram](https://telegram.org) - For the bot platform
- [PostgreSQL](https://postgresql.org) - Database with pgvector extension

## 📞 Support

If you have any questions or issues, please:

1. Check the [Issues](https://github.com/chenjunqian/jd-matcher/issues) page
2. Create a new issue if needed
3. Join our Telegram community (link coming soon)

---

⭐ If this project helps you, please give it a star!
