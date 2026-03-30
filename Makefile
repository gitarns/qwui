.PHONY: dev dev-go dev-rust down logs

# Quickwit + data generator only (run backend locally)
dev:
	docker compose down -v --remove-orphans
	docker network prune -f
	docker compose up -d

# Quickwit + Go backend + data generator
dev-go:
	docker compose down -v --remove-orphans
	docker network prune -f
	docker compose --profile go up -d

# Quickwit + Rust backend + data generator
dev-rust:
	docker compose down -v --remove-orphans
	docker network prune -f
	docker compose --profile rust up -d

# Stop everything and wipe volumes
down:
	docker ps -aq --filter "label=com.docker.compose.project=qwui" | xargs -r docker rm -f
	docker compose down -v --remove-orphans
	docker network prune -f

# Follow all logs
logs:
	docker compose logs -f

# Run Go backend locally (requires Quickwit running)
run-go:
	cd go-backend && QUICKWIT_URL=http://localhost:7280 go run .

# Run Rust backend locally (requires Quickwit running)
run-rust:
	cd rust-backend && QUICKWIT_URL=http://localhost:7280 cargo run

# Run frontend dev server
run-frontend:
	cd frontend && npm run dev
