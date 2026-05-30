from fastapi import FastAPI, UploadFile, File, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel
from groq import Groq
import subprocess, os, json, re, zipfile
from dotenv import load_dotenv

load_dotenv()
app = FastAPI(title="ClipFast API")
groq_client = Groq(api_key=os.getenv("GROQ_API_KEY"))

# Detect if running on Windows or Linux
IS_WINDOWS = os.name == "nt"
FFMPEG = FFMPEG if IS_WINDOWS else "ffmpeg"
FFMPEG_DIR = FFMPEG_DIR if IS_WINDOWS else "/usr/bin"
NODE_PATH = "C:\\Program Files\\nodejs" if IS_WINDOWS else "/usr/bin"
ENV_WITH_NODE = {**os.environ, "PATH": os.environ.get("PATH", "") + (f";{NODE_PATH}" if IS_WINDOWS else f":{NODE_PATH}")}

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Range", "Accept-Ranges", "Content-Length"],
)

class URLRequest(BaseModel):
    url: str
    clip_count: int = 6
    clip_length: int = 45
    niche: str = "Podcast"

@app.get("/")
def root():
    return {"status": "ClipFast backend running"}

@app.get("/video")
async def serve_video(request: Request):
    path = None
    media_type = "video/mp4"
    for ext in ["mp4", "webm", "mkv", "mov"]:
        p = f"downloads/video.{ext}"
        if os.path.exists(p):
            path = p
            media_type = f"video/{ext}"
            break
    for ext in ["mp4", "mov", "mkv", "webm", "avi"]:
        p = f"downloads/upload.{ext}"
        if os.path.exists(p):
            path = p
            media_type = f"video/{ext}"
            break
    if not path:
        raise HTTPException(status_code=404, detail="Video not found")
    return range_response(path, media_type, request)

@app.get("/audio")
async def serve_audio(request: Request):
    path = "downloads/audio_compressed.mp3"
    if not os.path.exists(path):
        path = "downloads/audio.mp3"
    for ext in ["mp3", "wav", "m4a", "aac"]:
        p = f"downloads/upload.{ext}"
        if os.path.exists(p):
            path = p
            break
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="Audio not found")
    return range_response(path, "audio/mpeg", request)

def range_response(path: str, media_type: str, request: Request):
    file_size = os.path.getsize(path)
    range_header = request.headers.get("range")

    if range_header:
        range_val = range_header.strip().replace("bytes=", "")
        parts = range_val.split("-")
        start = int(parts[0]) if parts[0] else 0
        end = int(parts[1]) if parts[1] else file_size - 1
        end = min(end, file_size - 1)
        chunk_size = end - start + 1

        def file_chunk():
            with open(path, "rb") as f:
                f.seek(start)
                remaining = chunk_size
                while remaining > 0:
                    data = f.read(min(65536, remaining))
                    if not data:
                        break
                    remaining -= len(data)
                    yield data

        return StreamingResponse(
            file_chunk(),
            status_code=206,
            media_type=media_type,
            headers={
                "Content-Range": f"bytes {start}-{end}/{file_size}",
                "Accept-Ranges": "bytes",
                "Content-Length": str(chunk_size),
            }
        )
    else:
        def full_file():
            with open(path, "rb") as f:
                while chunk := f.read(65536):
                    yield chunk

        return StreamingResponse(
            full_file(),
            media_type=media_type,
            headers={
                "Accept-Ranges": "bytes",
                "Content-Length": str(file_size),
            }
        )

@app.post("/process-url")
async def process_url(data: URLRequest):
    os.makedirs("downloads", exist_ok=True)

    # Clean old files
    for f in os.listdir("downloads"):
        try:
            os.remove(f"downloads/{f}")
        except:
            pass

    video_path = "downloads/video.mp4"
    audio_path = "downloads/audio.mp3"

    # Download full video with Node.js runtime for YouTube
    try:
        subprocess.run([
            "yt-dlp",
            "-f", "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best",
            "-o", video_path,
            "--force-overwrites",
            "--ffmpeg-location", FFMPEG_DIR,
            "--extractor-args", "youtube:skip=translated_subs",
            "--no-check-certificates",
            "--merge-output-format", "mp4",
            data.url
        ], check=True, capture_output=True, env=ENV_WITH_NODE)
    except subprocess.CalledProcessError as e:
        raise HTTPException(status_code=400, detail=f"Failed to download video: {e.stderr.decode()}")

    # Extract audio from video for transcription
    try:
        subprocess.run([
            FFMPEG,
            "-i", video_path,
            "-vn", "-acodec", "mp3",
            "-y", audio_path
        ], check=True, capture_output=True)
    except subprocess.CalledProcessError as e:
        raise HTTPException(status_code=500, detail=f"Audio extraction failed: {e.stderr.decode()}")

    return await process_audio(audio_path, video_path, data.clip_count, data.clip_length, data.niche)

@app.post("/process-file")
async def process_file(
    file: UploadFile = File(...),
    clip_count: int = 6,
    clip_length: int = 45,
    niche: str = "Podcast"
):
    os.makedirs("downloads", exist_ok=True)

    # Clean old files
    for f in os.listdir("downloads"):
        try:
            os.remove(f"downloads/{f}")
        except:
            pass

    ext = file.filename.split(".")[-1].lower()
    path = f"downloads/upload.{ext}"
    with open(path, "wb") as f:
        f.write(await file.read())

    video_extensions = ["mp4", "mov", "mkv", "webm", "avi"]
    audio_extensions = ["mp3", "wav", "m4a", "aac", "ogg"]

    if ext in video_extensions:
        video_path = path
        audio_path = "downloads/audio.mp3"
        subprocess.run([
            FFMPEG,
            "-i", video_path,
            "-vn", "-acodec", "mp3",
            "-y", audio_path
        ], check=True, capture_output=True)
    else:
        video_path = None
        audio_path = path

    return await process_audio(audio_path, video_path, clip_count, clip_length, niche)

async def process_audio(audio_path: str, video_path, clip_count: int, clip_length: int, niche: str):
    # Compress audio to under 25MB for Groq free tier
    compressed_path = "downloads/audio_compressed.mp3"
    try:
        subprocess.run([
            FFMPEG,
            "-i", audio_path,
            "-ar", "16000", "-ac", "1", "-b:a", "32k",
            "-y", compressed_path
        ], check=True, capture_output=True)
    except subprocess.CalledProcessError as e:
        raise HTTPException(status_code=500, detail=f"Audio compression failed: {e.stderr.decode()}")

    # Step 1: Transcribe with Groq Whisper (free)
    try:
        with open(compressed_path, "rb") as f:
            transcript = groq_client.audio.transcriptions.create(
                model="whisper-large-v3",
                file=f,
                response_format="verbose_json",
                timestamp_granularities=["segment"]
            )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Transcription failed: {str(e)}")

    segments_text = "\n".join([
        f"[{s['start']:.0f}s - {s['end']:.0f}s]: {s['text']}"
        for s in transcript.segments
    ])

    # Step 2: Groq LLM picks best clips (free)
    try:
        response = groq_client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[{
                "role": "user",
                "content": f"""You are a viral {niche} content expert. Analyze this transcript and find the {clip_count} most engaging moments for short-form video (TikTok/Reels/Shorts).

Each clip should be around {clip_length} seconds long. Pick moments with strong hooks, insights, stories, or emotional peaks.

Return ONLY a valid JSON array, no other text, no markdown:
[{{"title": "compelling clip title", "start": 10, "end": 55, "score": 94, "tag": "Hook", "reason": "why this will go viral"}}]

Tags must be one of: Hook, Insight, Story, Tip, Controversial, Hack, Warning, Opinion

Transcript:
{segments_text}"""
            }],
            temperature=0.7
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI analysis failed: {str(e)}")

    raw = response.choices[0].message.content
    raw = re.sub(r"```json|```", "", raw).strip()

    try:
        clips = json.loads(raw)
    except json.JSONDecodeError:
        raise HTTPException(status_code=500, detail="Failed to parse AI response")

    return {
        "clips": clips,
        "audio_path": audio_path,
        "video_path": video_path,
        "has_video": video_path is not None and os.path.exists(str(video_path)),
        "total_duration": transcript.segments[-1]["end"] if transcript.segments else 0
    }

@app.post("/export")
async def export_clips(data: dict):
    video_path = data.get("video_path")
    audio_path = data.get("audio_path", "downloads/audio.mp3")
    clips = data.get("clips", [])
    has_video = data.get("has_video", False)

    os.makedirs("exports", exist_ok=True)

    # Clean old exports
    for f in os.listdir("exports"):
        try:
            os.remove(f"exports/{f}")
        except:
            pass

    zip_path = "exports/clips.zip"
    ffmpeg = FFMPEG
    exported_files = []

    for i, clip in enumerate(clips):
        start = str(float(clip["start"]))
        duration = str(float(clip["end"]) - float(clip["start"]))
        tag = clip.get("tag", "clip").replace("/", "-").replace(" ", "_")

        if has_video and video_path and os.path.exists(str(video_path)):
            clip_path = os.path.abspath(f"exports/clip_{i+1}_{tag}.mp4")
            cmd = [
                ffmpeg,
                "-ss", start,
                "-i", str(video_path),
                "-t", duration,
                "-c", "copy",
                "-avoid_negative_ts", "make_zero",
                "-y", clip_path
            ]
        else:
            src = str(audio_path) if audio_path and os.path.exists(str(audio_path)) else "downloads/audio_compressed.mp3"
            clip_path = os.path.abspath(f"exports/clip_{i+1}_{tag}.mp3")
            cmd = [
                ffmpeg,
                "-ss", start,
                "-i", src,
                "-t", duration,
                "-c", "copy",
                "-y", clip_path
            ]

        try:
            result = subprocess.run(cmd, capture_output=True, timeout=120)
            if result.returncode == 0 and os.path.exists(clip_path) and os.path.getsize(clip_path) > 0:
                exported_files.append(clip_path)
            else:
                print(f"FFmpeg error for clip {i+1}: {result.stderr.decode()}")
        except subprocess.TimeoutExpired:
            print(f"Timeout on clip {i+1}")
            continue
        except Exception as ex:
            print(f"Error on clip {i+1}: {ex}")
            continue

    if not exported_files:
        raise HTTPException(status_code=500, detail="No clips could be exported. Check that your video file exists and ffmpeg is working.")

    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zipf:
        for fp in exported_files:
            zipf.write(fp, os.path.basename(fp))

    return FileResponse(
        zip_path,
        media_type="application/zip",
        filename="clipfast_exports.zip",
        headers={"Content-Disposition": "attachment; filename=clipfast_exports.zip"}
    )