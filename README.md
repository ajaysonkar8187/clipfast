# ClipFast ⚡
> Turn long videos into viral short clips using AI — built for $0

---

## Quick Start

### 1. Backend Setup
```bash
cd backend
python -m venv venv

# Windows
venv\Scripts\activate

# Mac/Linux
source venv/bin/activate

pip install -r requirements.txt

# Create your .env file
copy .env.example .env
# Open .env and add your OpenAI API key
# Get free key at: https://platform.openai.com/api-keys

# Run the backend
uvicorn main:app --reload --port 8000
```
Test: open http://localhost:8000 — you should see `{"status": "ClipFast backend running ✅"}`

---

### 2. Frontend Setup
Open a NEW terminal window:
```bash
cd frontend
npm install
npm run dev
```
Open: http://localhost:3000

---

## How to use
1. Select your content niche (Podcast, YouTube, etc.)
2. Paste a YouTube URL or upload a video/audio file
3. Choose how many clips and what length
4. Click "Generate clips ⚡"
5. Wait 1-3 minutes for AI to process
6. Select your best clips and export!

---

## Tech Stack
- **Frontend**: Next.js 14 + TypeScript + Tailwind CSS
- **Backend**: Python + FastAPI
- **AI**: OpenAI Whisper (transcription) + GPT-4o (clip selection)
- **Video**: FFmpeg + yt-dlp

## Cost
- **During testing**: $0 (OpenAI gives $5 free credit = ~50 videos)
- **After free credit**: ~$0.10 per video

## Deploy for free
- Frontend → Vercel (https://vercel.com)
- Backend → Render (https://render.com)
