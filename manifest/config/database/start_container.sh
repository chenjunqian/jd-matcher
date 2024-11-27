docker run -d \
  --name jdmatcher-postgres \
  -e POSTGRES_USER=jdmatcher \
  -e POSTGRES_PASSWORD=1qaz!QAZ \
  -e POSTGRES_DB=jdmatcherdb \
  -p 5432:5432 \
  --net=host \
  -v $(pwd)/db-data:/var/lib/postgresql/data \
  postgres:17.2-bookworm