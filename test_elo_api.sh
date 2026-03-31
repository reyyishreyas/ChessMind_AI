#!/bin/bash

# Test ELO prediction API endpoint
echo "Testing ELO Prediction API..."
echo ""

# Test 1: Health check
echo "1️⃣  Testing health endpoint..."
curl -s http://localhost:8000/health | jq . || echo "❌ Health check failed"
echo ""

# Test 2: Sample ELO prediction request
echo "2️⃣  Testing ELO prediction with sample move..."
SAMPLE_REQUEST=$(cat <<'EOF'
{
  "features": {
    "move_number": 5,
    "start_eval": 0.2,
    "end_eval": 0.8,
    "delta_eval": 0.6,
    "move_quality": "Good",
    "time_per_move": 2.5,
    "accuracy_score": 85,
    "blunder_risk": "low",
    "flag1": 0,
    "flag2": 0,
    "flag3": 0,
    "last_elo": 1200,
    "phase_Opening": true,
    "phase_Middlegame": false,
    "phase_Endgame": false
  }
}
EOF
)

echo "$SAMPLE_REQUEST" | curl -s -X POST http://localhost:8000/predict-elo \
  -H "Content-Type: application/json" \
  -d @- | jq . || echo "❌ ELO prediction failed"

echo ""
echo "✅ API test complete!"
