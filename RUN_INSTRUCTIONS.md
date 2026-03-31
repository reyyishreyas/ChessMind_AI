# How to Run the Chess Application

## Prerequisites
- **Python 3.8+** (for FastAPI backend)
- **Node.js 18+** (for Next.js frontend)
- **npm** or **pnpm** (package manager)

## Step-by-Step Instructions

### Step 1: Install Frontend Dependencies

Open a terminal in the project root directory:

```bash
# Install Node.js dependencies
npm install
# OR if you're using pnpm
pnpm install
```

### Step 2: Install Backend Dependencies

```bash
# Navigate to backend directory
cd backend

# Install Python dependencies
pip install -r requirements.txt

# If you have multiple Python versions, use:
# python3 -m pip install -r requirements.txt
```

### Step 3: Set Up Environment Variables

Create a `.env.local` file in the project root (same level as `package.json`):

```bash
# In project root
touch .env.local
```

Add the following to `.env.local`:

```env
GEMINI_API_KEY=your_gemini_api_key_here
FASTAPI_URL=http://localhost:8000
```

**To get a Gemini API key:**
1. Go to https://makersuite.google.com/app/apikey
2. Create a new API key
3. Copy and paste it into `.env.local`

### Step 4: Verify Model Exists

Make sure the trained model exists:

```bash
# Check if model file exists
ls model/ensemble_model.pkl
```

If the file doesn't exist, you need to train the model first:

```bash
cd model
python train.py
```

This will create `ensemble_model.pkl` (this may take a while).

### Step 5: Start FastAPI Backend

Open a **new terminal window** and run:

```bash
# Navigate to backend directory
cd backend

# Start the FastAPI server
python main.py

# OR using uvicorn directly:
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

You should see:
```
✅ Model loaded from /path/to/model/ensemble_model.pkl
INFO:     Uvicorn running on http://0.0.0.0:8000
```

**Keep this terminal open!** The backend must be running.

### Step 6: Start Next.js Frontend

Open **another new terminal window** and run:

```bash
# Make sure you're in the project root (not in backend/)
cd /Users/reyyishreyas/Desktop/chessv2

# Start the Next.js development server
npm run dev
# OR
pnpm dev
```

You should see:
```
✓ Ready in X seconds
○ Local: http://localhost:3000
```

### Step 7: Open the Application

Open your browser and go to:
```
http://localhost:3000
```

## Running Both Services

You need **TWO terminal windows** running simultaneously:

**Terminal 1 (Backend):**
```bash
cd backend
python main.py
```

**Terminal 2 (Frontend):**
```bash
npm run dev
```

## Quick Test

1. Open http://localhost:3000
2. Start a new game
3. Make a move
4. Check the header - you should see:
   - Your ELO
   - Bot ELO (updates dynamically)
   - Difficulty level

## Troubleshooting

### "Model not found" Error
```bash
# Train the model first
cd model
python train.py
```

### "Cannot connect to FastAPI" Error
- Make sure backend is running on port 8000
- Check `FASTAPI_URL` in `.env.local` is `http://localhost:8000`
- Try accessing http://localhost:8000/health in your browser

### "GEMINI_API_KEY not found" Error
- Make sure `.env.local` exists in project root
- Restart the Next.js server after adding environment variables
- Check the key is correct (no extra spaces)

### Port Already in Use
If port 3000 or 8000 is already in use:

**For Next.js (port 3000):**
```bash
PORT=3001 npm run dev
```

**For FastAPI (port 8000):**
```bash
# Edit backend/main.py, change port in uvicorn.run()
# OR
uvicorn main:app --reload --port 8001
# Then update FASTAPI_URL in .env.local to http://localhost:8001
```

### Python Module Not Found
```bash
# Make sure you're using the correct Python
python --version
# Should be 3.8+

# Try installing with pip3
pip3 install -r backend/requirements.txt
```

## Production Build

For production:

**Backend:**
```bash
cd backend
uvicorn main:app --host 0.0.0.0 --port 8000
```

**Frontend:**
```bash
npm run build
npm start
```

## Summary

1. ✅ Install frontend deps: `npm install`
2. ✅ Install backend deps: `cd backend && pip install -r requirements.txt`
3. ✅ Create `.env.local` with `GEMINI_API_KEY` and `FASTAPI_URL`
4. ✅ Start backend: `cd backend && python main.py` (Terminal 1)
5. ✅ Start frontend: `npm run dev` (Terminal 2)
6. ✅ Open http://localhost:3000

Both servers must be running at the same time!

