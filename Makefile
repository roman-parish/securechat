# SecureChat — common commands
# Usage: make <command>

.PHONY: help deploy logs restart stop status shell-backend shell-frontend

help:
	@echo ""
	@echo "  SecureChat Commands"
	@echo "  ─────────────────────────────"
	@echo "  make deploy       Pull latest code and redeploy"
	@echo "  make logs         Tail all container logs"
	@echo "  make logs-backend  Tail backend logs only"
	@echo "  make logs-frontend Tail frontend logs only"
	@echo "  make restart      Restart all containers (no rebuild)"
	@echo "  make stop         Stop all containers"
	@echo "  make status       Show container status"
	@echo "  make shell-backend  Open shell in backend container"
	@echo ""

deploy:
	@git pull
	@./deploy.sh

logs:
	docker compose logs -f --tail=100

logs-backend:
	docker compose logs -f --tail=100 backend

logs-frontend:
	docker compose logs -f --tail=100 frontend

restart:
	docker compose restart

stop:
	docker compose down

status:
	docker compose ps

shell-backend:
	docker compose exec backend sh

shell-frontend:
	docker compose exec frontend sh
