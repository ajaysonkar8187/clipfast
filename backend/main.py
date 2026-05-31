from fastapi import FastAPI, UploadFile, File, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel
from groq import Groq
import subprocess, os, json, re, zipfile, math
from dotenv import load_dotenv

load_dotenv()
app = FastAPI(title="ClipFast API")
groq_client = Groq(api_key=os.getenv("GROQ_API_KEY"))

IS_WINDOWS = os.name == "nt"
FFMPEG = "C:\\ffmpeg\\bin\\ffmpeg.exe" if IS_WINDOWS else "ffmpeg"
FFMPEG_DIR = "C:\\ffmpeg\\bin" if IS_WINDOWS else "/usr/bin"

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
            file_chunk(), status_code=206, media_type=media_type,
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
            full_file(), media_type=media_type,
            headers={"Accept-Ranges": "bytes", "Content-Length": str(file_size)}
        )

def write_cookies_file():
    """Write YouTube cookies from environment variable to file"""
    youtube_cookies = os.getenv("YOUTUBE_COOKIES", "")
    if not youtube_cookies:
        return None
    cookies_file = "downloads/cookies.txt"
    os.makedirs("downloads", exist_ok=True)
    lines = []
    for line in youtube_cookies.strip().split("\n"):
        line = line.strip()
        if line.startswith("#") or not line:
            lines.append(line)
        else:
            parts = line.split()
            if len(parts) >= 7:
                lines.append("\t".join(parts[:7]))
            else:
                lines.append(line)
    with open(cookies_file, "w") as f:
        f.write("\n".join(lines))
    return cookies_file

def compress_audio(input_path: str, output_path: str):
    """Compress audio to low bitrate for Groq"""
    subprocess.run([
        FFMPEG, "-i", input_path,
        "-ar", "16000", "-ac", "1", "-b:a", "32k",
        "-y", output_path
    ], check=True, capture_output=True)

def get_audio_duration(audio_path: str) -> float:
    """Get duration of audio file in seconds"""
    result = subprocess.run([
        FFMPEG, "-i", audio_path,
        "-f", "null", "-"
    ], capture_output=True, text=True)
    # Parse duration from stderr
    for line in result.stderr.split("\n"):
        if "Duration" in line:
            time_str = line.split("Duration:")[1].split(",")[0].strip()
            parts = time_str.split(":")
            if len(parts) == 3:
                h, m, s = parts
                return float(h) * 3600 + float(m) * 60 + float(s)
    return 0

def split_audio(audio_path: str, chunk_duration: int = 1200) -> list:
    """Split audio into chunks of chunk_duration seconds (default 20 min)"""
    duration = get_audio_duration(audio_path)
    if duration <= chunk_duration:
        return [audio_path]
    
    chunks = []
    num_chunks = math.ceil(duration / chunk_duration)
    os.makedirs("downloads/chunks", exist_ok=True)
    
    for i in range(num_chunks):
        start = i * chunk_duration
        chunk_path = f"downloads/chunks/chunk_{i}.mp3"
        subprocess.run([
            FFMPEG, "-i", audio_path,
            "-ss", str(start),
            "-t", str(chunk_duration),
            "-c", "copy",
            "-y", chunk_path
        ], check=True, capture_output=True)
        chunks.append((chunk_path, start))
    
    return chunks

def transcribe_audio(audio_path: str) -> list:
    """Transcribe audio, handling long files by chunking"""
    compressed = audio_path.replace(".mp3", "_compressed.mp3")
    
    # Compress audio
    compress_audio(audio_path, compressed)
    
    file_size = os.path.getsize(compressed)
    max_size = 24 * 1024 * 1024  # 24MB limit for Groq
    
    if file_size <= max_size:
        # Single file transcription
        with open(compressed, "rb") as f:
            transcript = groq_client.audio.transcriptions.create(
                model="whisper-large-v3",
                file=f,
                response_format="verbose_json",
                timestamp_granularities=["segment"]
            )
        return transcript.segments
    else:
        # Split into chunks and transcribe each
        chunks = split_audio(compressed, chunk_duration=1200)
        all_segments = []
        
        for chunk_info in chunks:
            if isinstance(chunk_info, tuple):
                chunk_path, time_offset = chunk_info
            else:
                chunk_path, time_offset = chunk_info, 0
            
            # Compress chunk
            chunk_compressed = chunk_path.replace(".mp3", "_c.mp3")
            compress_audio(chunk_path, chunk_compressed)
            
            with open(chunk_compressed, "rb") as f:
                transcript = groq_client.audio.transcriptions.create(
                    model="whisper-large-v3",
                    file=f,
                    response_format="verbose_json",
                    timestamp_granularities=["segment"]
                )
            
            # Adjust timestamps based on chunk offset
            for seg in transcript.segments:
                seg['start'] += time_offset
                seg['end'] += time_offset
                all_segments.append(seg)
        
        return all_segments

@app.post("/process-url")
async def process_url(data: URLRequest):
    os.makedirs("downloads", exist_ok=True)
    for f in os.listdir("downloads"):
        try:
            if os.path.isfile(f"downloads/{f}"):
                os.remove(f"downloads/{f}")
        except:
            pass

    audio_path = "downloads/audio.mp3"
    cookies_file = write_cookies_file()

    base_args = [
        "--force-overwrites",
        "--no-check-certificates",
        "--add-header", "User-Agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    ]
    if cookies_file:
        base_args += ["--cookies", cookies_file]
    if IS_WINDOWS:
        base_args += ["--ffmpeg-location", FFMPEG_DIR, "--js-runtime", "nodejs"]

    # Download audio only — fast even for long videos
    methods = [
        ["yt-dlp", "-f", "bestaudio[ext=m4a]/bestaudio/best", "-x", "--audio-format", "mp3", "--audio-quality", "5", "-o", audio_path] + base_args,
        ["yt-dlp", "-x", "--audio-format", "mp3", "--audio-quality", "5", "-o", audio_path, "--extractor-args", "youtube:player_client=android"] + base_args,
        ["yt-dlp", "-x", "--audio-format", "mp3", "-o", audio_path] + base_args,
    ]

    last_error = ""
    downloaded = False
    for cmd in methods:
        try:
            cmd.append(data.url)
            result = subprocess.run(cmd, capture_output=True, timeout=600)
            if result.returncode == 0 and os.path.exists(audio_path):
                downloaded = True
                break
            last_error = result.stderr.decode()
        except Exception as e:
            last_error = str(e)
            continue

    if not downloaded:
        raise HTTPException(status_code=400, detail=f"Failed to download video: {last_error}")

    return await process_audio(audio_path, None, data.clip_count, data.clip_length, data.niche)

@app.post("/process-file")
async def process_file(
    file: UploadFile = File(...),
    clip_count: int = 6,
    clip_length: int = 45,
    niche: str = "Podcast"
):
    os.makedirs("downloads", exist_ok=True)
    for f in os.listdir("downloads"):
        try:
            if os.path.isfile(f"downloads/{f}"):
                os.remove(f"downloads/{f}")
        except:
            pass

    ext = file.filename.split(".")[-1].lower()
    path = f"downloads/upload.{ext}"
    with open(path, "wb") as f:
        f.write(await file.read())

    video_extensions = ["mp4", "mov", "mkv", "webm", "avi"]
    if ext in video_extensions:
        video_path = path
        audio_path = "downloads/audio.mp3"
        subprocess.run([
            FFMPEG, "-i", video_path,
            "-vn", "-acodec", "mp3", "-y", audio_path
        ], check=True, capture_output=True)
    else:
        video_path = None
        audio_path = path

    return await process_audio(audio_path, video_path, clip_count, clip_length, niche)

async def process_audio(audio_path: str, video_path, clip_count: int, clip_length: int, niche: str):
    # Transcribe with chunking support for long videos
    try:
        segments = transcribe_audio(audio_path)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Transcription failed: {str(e)}")

    if not segments:
        raise HTTPException(status_code=500, detail="No speech found in audio")

    segments_text = "\n".join([
        f"[{s['start']:.0f}s - {s['end']:.0f}s]: {s['text']}"
        for s in segments
    ])

    # Limit transcript length for AI to avoid token limits
    max_chars = 12000
    if len(segments_text) > max_chars:
        segments_text = segments_text[:max_chars] + "\n...[transcript continues]"

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
        "total_duration": segments[-1]["end"] if segments else 0
    }

@app.post("/export")
async def export_clips(data: dict):
    video_path = data.get("video_path")
    audio_path = data.get("audio_path", "downloads/audio.mp3")
    clips = data.get("clips", [])
    has_video = data.get("has_video", False)

    os.makedirs("exports", exist_ok=True)
    for f in os.listdir("exports"):
        try:
            os.remove(f"exports/{f}")
        except:
            pass

    zip_path = "exports/clips.zip"
    exported_files = []

    for i, clip in enumerate(clips):
        start = str(float(clip["start"]))
        duration = str(float(clip["end"]) - float(clip["start"]))
        tag = clip.get("tag", "clip").replace("/", "-").replace(" ", "_")

        if has_video and video_path and os.path.exists(str(video_path)):
            clip_path = os.path.abspath(f"exports/clip_{i+1}_{tag}.mp4")
            cmd = [FFMPEG, "-ss", start, "-i", str(video_path), "-t", duration,
                   "-c:v", "libx264", "-c:a", "aac", "-avoid_negative_ts", "make_zero",
                   "-movflags", "+faststart", "-y", clip_path]
        else:
            src = str(audio_path) if audio_path and os.path.exists(str(audio_path)) else "downloads/audio_compressed.mp3"
            clip_path = os.path.abspath(f"exports/clip_{i+1}_{tag}.mp3")
            cmd = [FFMPEG, "-ss", start, "-i", src, "-t", duration, "-c", "copy", "-y", clip_path]

        try:
            result = subprocess.run(cmd, capture_output=True, timeout=120)
            if result.returncode == 0 and os.path.exists(clip_path) and os.path.getsize(clip_path) > 0:
                exported_files.append(clip_path)
        except Exception:
            continue

    if not exported_files:
        raise HTTPException(status_code=500, detail="No clips could be exported.")

    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zipf:
        for fp in exported_files:
            zipf.write(fp, os.path.basename(fp))

    return FileResponse(
        zip_path, media_type="application/zip", filename="clipfast_exports.zip",
        headers={"Content-Disposition": "attachment; filename=clipfast_exports.zip"}
    )