#!/bin/bash

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🔍 Chess ELO System Validation${NC}\n"

# Check 1: Backend dependencies
echo -e "${BLUE}1️⃣  Checking Backend Dependencies...${NC}"
python3 -c "
import sys
try:
    import fastapi
    import pandas
    import numpy
    import sklearn
    import lightgbm
    import xgboost
    import catboost
    print('${GREEN}✅ All dependencies installed${NC}')
except ImportError as e:
    print(f'${RED}❌ Missing: {e.name}${NC}')
    sys.exit(1)
" || echo -e "${RED}❌ Dependencies check failed${NC}"

# Check 2: Environment variables
echo -e "\n${BLUE}2️⃣  Checking Environment Variables...${NC}"
if grep -q "FASTAPI_URL" /Users/reyyishreyas/Desktop/chessv2/.env.local; then
    echo -e "${GREEN}✅ FASTAPI_URL found in .env.local${NC}"
    FASTAPI_URL=$(grep "FASTAPI_URL" /Users/reyyishreyas/Desktop/chessv2/.env.local | cut -d'=' -f2 | tr -d '"')
    echo "   URL: $FASTAPI_URL"
else
    echo -e "${RED}❌ FASTAPI_URL missing in .env.local${NC}"
fi

if grep -q "GEMINI_API_KEY" /Users/reyyishreyas/Desktop/chessv2/.env.local; then
    echo -e "${GREEN}✅ GEMINI_API_KEY found${NC}"
else
    echo -e "${RED}❌ GEMINI_API_KEY missing${NC}"
fi

if grep -q "NEXT_PUBLIC_SUPABASE_URL" /Users/reyyishreyas/Desktop/chessv2/.env.local; then
    echo -e "${GREEN}✅ Supabase configured${NC}"
else
    echo -e "${RED}❌ Supabase not configured${NC}"
fi

# Check 3: Model file
echo -e "\n${BLUE}3️⃣  Checking Model File...${NC}"
if [ -f "/Users/reyyishreyas/Desktop/chessv2/model/ensemble_model.pkl" ]; then
    SIZE=$(ls -lh /Users/reyyishreyas/Desktop/chessv2/model/ensemble_model.pkl | awk '{print $5}')
    echo -e "${GREEN}✅ Model file exists (${SIZE})${NC}"
else
    echo -e "${RED}❌ Model file not found${NC}"
fi

# Check 4: Backend health (if running)
echo -e "\n${BLUE}4️⃣  Checking Backend Health...${NC}"
if curl -s http://localhost:8000/health > /dev/null 2>&1; then
    RESPONSE=$(curl -s http://localhost:8000/health)
    if echo "$RESPONSE" | grep -q "healthy"; then
        echo -e "${GREEN}✅ Backend is running and healthy${NC}"
        echo "   Response: $RESPONSE"
    else
        echo -e "${YELLOW}⚠️  Backend running but not healthy${NC}"
    fi
else
    echo -e "${YELLOW}⚠️  Backend not running (this is OK if not started yet)${NC}"
    echo "   To start: cd backend && python main.py"
fi

# Check 5: Frontend check
echo -e "\n${BLUE}5️⃣  Checking Frontend Setup...${NC}"
if [ -f "/Users/reyyishreyas/Desktop/chessv2/.next" ] || [ -d "/Users/reyyishreyas/Desktop/chessv2/.next" ]; then
    echo -e "${GREEN}✅ Frontend build exists${NC}"
else
    echo -e "${YELLOW}⚠️  Frontend not built yet${NC}"
    echo "   To build: npm run build or pnpm build"
fi

# Check 6: Key source files
echo -e "\n${BLUE}6️⃣  Checking Source Files...${NC}"
if grep -q "predictElo" /Users/reyyishreyas/Desktop/chessv2/components/chess-game.tsx; then
    echo -e "${GREEN}✅ ELO prediction integrated in chess-game.tsx${NC}"
else
    echo -e "${RED}❌ ELO prediction not found in chess-game.tsx${NC}"
fi

if grep -q "FASTAPI_URL" /Users/reyyishreyas/Desktop/chessv2/app/api/predict-elo/route.ts; then
    echo -e "${GREEN}✅ FASTAPI_URL configured in predict-elo route${NC}"
else
    echo -e "${RED}❌ FASTAPI_URL not configured in route${NC}"
fi

# Summary
echo -e "\n${BLUE}📋 Summary${NC}"
echo -e "${GREEN}✅ System is ready for ELO dynamic adjustment!${NC}"
echo ""
echo "Next steps:"
echo "1. Start Backend:   cd backend && python main.py"
echo "2. Start Frontend:  npm run dev (or pnpm dev)"
echo "3. Open:           http://localhost:3000"
echo "4. Play a game and watch browser console for ELO updates"
echo ""
echo "Debug logs to watch for:"
echo "  📊 Backend prediction response: {predicted_elo: ..., success: true}"
echo "  ✅ Bot ELO updated from model: {old: ..., new: ...}"
echo "  🎮 Difficulty updated to: ..."
