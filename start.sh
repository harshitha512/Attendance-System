#!/bin/bash
# ─────────────────────────────────────────────
# Start all services: Backend + Face Service + Frontend
# ─────────────────────────────────────────────

ROOT="$(cd "$(dirname "$0")" && pwd)"
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'

echo -e "${GREEN}▶ Starting Attendance Facial Recognition System...${NC}"

# Backend
echo -e "${YELLOW}[1/3] Starting Node.js backend on :5000${NC}"
cd "$ROOT/backend" && npm install --silent && npm start &
BACKEND_PID=$!

# Face Service
echo -e "${YELLOW}[2/3] Starting Python face service on :8000${NC}"
cd "$ROOT/face-service"
if [ ! -d ".venv" ]; then
  python3 -m venv .venv
  .venv/bin/pip install -r requirements.txt -q
fi
.venv/bin/python main.py &
FACE_PID=$!

# Frontend
echo -e "${YELLOW}[3/3] Starting React frontend on :3000${NC}"
cd "$ROOT/frontend" && npm install --silent && npm run dev &
FRONTEND_PID=$!

echo -e "${GREEN}✔ All services started!${NC}"
echo ""
echo "  Frontend  → http://localhost:3000"
echo "  Backend   → http://localhost:5000"
echo "  Face API  → http://localhost:8000/docs"
echo ""
echo "  Default login: admin / Admin@1234"
echo ""
echo "Press Ctrl+C to stop all services"

trap "kill $BACKEND_PID $FACE_PID $FRONTEND_PID 2>/dev/null; echo 'All services stopped.'" EXIT
wait
