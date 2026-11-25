.PHONY: dev dev-backend down logs test quickwit-api-surface

# Quickwit + data generator only (run backend locally)
dev:
	docker compose down -v --remove-orphans
	docker network prune -f
	docker compose up -d

# Quickwit + backend + data generator
dev-backend:
	docker compose down -v --remove-orphans
	docker network prune -f
	docker compose --profile backend up -d

# Stop everything and wipe volumes
down:
	docker ps -aq --filter "label=com.docker.compose.project=qwui" | xargs -r docker rm -f
	docker compose down -v --remove-orphans
	docker network prune -f

# Follow all logs
logs:
	docker compose logs -f

# Run the backend locally (requires Quickwit running)
run-backend:
	cd rust-backend && QUICKWIT_URL=http://localhost:7280 cargo run

# Run frontend dev server
run-frontend:
	cd frontend && npm run dev

# Backend tests, including the MCP read-only and Quickwit API drift checks
test:
	cd rust-backend && cargo test

# Re-vendor Quickwit's API surface after upgrading Quickwit, then verify the MCP
# tools still match it. Needs a reachable Quickwit (QUICKWIT_URL, default :7280).
quickwit-api-surface:
	python ci/refresh-quickwit-api-surface.py $(or $(QUICKWIT_URL),http://localhost:7280)
	cd rust-backend && cargo test
