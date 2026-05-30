"use client";
import { useState, useRef, useEffect } from "react";
import axios from "axios";

const API = "https://clipfast-backend.onrender.com";

type Clip = {
  title: string;
  start: number;
  end: number;
  score: number;
  tag: string;
  reason: string;
};

const NICHES = ["Podcast", "YouTube", "Online Course", "Coach / Speaker", "Faceless Channel"];
const LENGTHS = [{ label: "30s", val: 30 }, { label: "45s", val: 45 }, { label: "60s", val: 60 }, { label: "90s", val: 90 }];
const COUNTS = [4, 6, 8, 10];

const TAG_COLORS: Record<string, string> = {
  Hook: "rgba(255,101,132,0.15)", Insight: "rgba(108,99,255,0.15)",
  Story: "rgba(67,233,123,0.15)", Tip: "rgba(255,193,7,0.15)",
  Controversial: "rgba(255,87,34,0.15)", Hack: "rgba(0,188,212,0.15)",
  Warning: "rgba(255,152,0,0.15)", Opinion: "rgba(156,39,176,0.15)",
};
const TAG_TEXT: Record<string, string> = {
  Hook: "#ff8fab", Insight: "#a89cff", Story: "#43e97b",
  Tip: "#ffd54f", Controversial: "#ff8a65", Hack: "#4dd0e1",
  Warning: "#ffb74d", Opinion: "#ce93d8",
};

function formatTime(s: number) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

function ScoreBadge({ score }: { score: number }) {
  const cls = score >= 90 ? "score-high" : score >= 80 ? "score-mid" : "score-low";
  return <span className={`${cls} text-xs font-bold px-2 py-0.5 rounded-full font-display`}>{score}</span>;
}

function PlayerModal({ clip, mediaSrc, hasVideo, onClose }: {
  clip: Clip;
  mediaSrc: string;
  hasVideo: boolean;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(clip.start);
  const [ready, setReady] = useState(false);
  const duration = clip.end - clip.start;

  useEffect(() => {
    const media = hasVideo ? videoRef.current : audioRef.current;
    if (!media) return;

    setPlaying(false);
    setReady(false);
    setCurrentTime(clip.start);

    const onLoadedMetadata = () => {
      media.currentTime = clip.start;
    };

    const onSeeked = () => {
      setCurrentTime(media.currentTime);
      setReady(true);
    };

    const onTimeUpdate = () => {
      setCurrentTime(media.currentTime);
      if (media.currentTime >= clip.end) {
        media.pause();
        media.currentTime = clip.start;
        setCurrentTime(clip.start);
        setPlaying(false);
      }
    };

    media.addEventListener("loadedmetadata", onLoadedMetadata);
    media.addEventListener("seeked", onSeeked);
    media.addEventListener("timeupdate", onTimeUpdate);

    if (media.readyState >= 1) {
      media.currentTime = clip.start;
    }

    return () => {
      media.removeEventListener("loadedmetadata", onLoadedMetadata);
      media.removeEventListener("seeked", onSeeked);
      media.removeEventListener("timeupdate", onTimeUpdate);
      media.pause();
    };
  }, [clip.start, clip.end, hasVideo]);

  function togglePlay() {
    const media = hasVideo ? videoRef.current : audioRef.current;
    if (!media || !ready) return;
    if (playing) {
      media.pause();
      setPlaying(false);
    } else {
      if (media.currentTime < clip.start || media.currentTime >= clip.end) {
        media.currentTime = clip.start;
      }
      media.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
    }
  }

  function restart() {
    const media = hasVideo ? videoRef.current : audioRef.current;
    if (!media) return;
    media.pause();
    media.currentTime = clip.start;
    setCurrentTime(clip.start);
    setPlaying(false);
  }

  const progress = Math.min(((currentTime - clip.start) / duration) * 100, 100);

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, backdropFilter: "blur(8px)" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "var(--bg2)", border: "1px solid var(--border2)", borderRadius: 20, padding: 24, width: "90%", maxWidth: hasVideo ? 560 : 440 }}>

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 11, color: "var(--text2)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.06em", fontFamily: "'Syne', sans-serif", fontWeight: 600 }}>Preview clip</div>
            <div style={{ fontSize: 14, fontWeight: 500, lineHeight: 1.4, maxWidth: 380 }}>{clip.title}</div>
          </div>
          <button onClick={onClose} style={{ background: "var(--bg3)", border: "1px solid var(--border)", borderRadius: 8, width: 32, height: 32, cursor: "pointer", color: "var(--text2)", fontSize: 18, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginLeft: 12 }}>×</button>
        </div>

        {/* Video player */}
        {hasVideo && (
          <div style={{ borderRadius: 12, overflow: "hidden", background: "#000", marginBottom: 16, position: "relative" }}>
            <video
              ref={videoRef}
              src={mediaSrc}
              style={{ width: "100%", maxHeight: 300, display: "block" }}
              preload="auto"
            />
          </div>
        )}

        {/* Audio-only waveform */}
        {!hasVideo && (
          <div style={{ display: "flex", alignItems: "center", gap: 2, marginBottom: 16, height: 48, justifyContent: "center" }}>
            {Array.from({ length: 48 }).map((_, i) => {
              const barProgress = (i / 48) * 100;
              const active = barProgress <= progress;
              const heights = [12,18,24,14,30,20,16,28,22,10,26,18,32,14,20,24,16,28,12,22,30,18,14,26,20,24,16,30,12,22,18,28,14,24,20,16,30,12,26,18,22,28,14,20,24,16,18,12];
              return (
                <div key={i} style={{ width: 3, height: `${heights[i] || 16}px`, borderRadius: 99, flexShrink: 0, background: active ? "linear-gradient(180deg, #6c63ff, #a89cff)" : "var(--bg3)", transition: "background 0.1s" }} />
              );
            })}
          </div>
        )}

        {/* Progress bar */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ height: 4, background: "var(--bg3)", borderRadius: 99, overflow: "hidden", marginBottom: 6 }}>
            <div style={{ height: "100%", width: `${progress}%`, background: "linear-gradient(90deg, #6c63ff, #a89cff)", borderRadius: 99, transition: "width 0.1s" }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--text2)" }}>
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(clip.end)}</span>
          </div>
        </div>

        {/* Controls */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 16 }}>
          <button onClick={restart} style={{ background: "var(--bg3)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 16px", cursor: "pointer", color: "var(--text2)", fontSize: 13 }}>
            ↩ Restart
          </button>
          <button onClick={togglePlay} style={{ width: 52, height: 52, borderRadius: "50%", background: ready ? "linear-gradient(135deg, #6c63ff, #a89cff)" : "var(--bg3)", border: "none", cursor: ready ? "pointer" : "not-allowed", color: "white", fontSize: 20, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: ready ? "0 4px 20px rgba(108,99,255,0.4)" : "none", transition: "all 0.2s" }}>
            {!ready ? "⏳" : playing ? "⏸" : "▶"}
          </button>
          <div style={{ fontSize: 12, color: "var(--text2)", textAlign: "center" }}>
            <div style={{ fontWeight: 600, color: "var(--text)", fontSize: 14 }}>{formatTime(duration)}</div>
            <div>duration</div>
          </div>
        </div>

        {/* Tag */}
        <div style={{ marginTop: 16, display: "flex", justifyContent: "center" }}>
          <span style={{ background: TAG_COLORS[clip.tag] || "rgba(108,99,255,0.1)", color: TAG_TEXT[clip.tag] || "#a89cff", fontSize: 11, padding: "3px 12px", borderRadius: 99, fontFamily: "'Syne', sans-serif", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase" }}>
            {clip.tag}
          </span>
        </div>

        {/* Hidden audio for audio-only mode */}
        {!hasVideo && <audio ref={audioRef} src={mediaSrc} preload="auto" />}
      </div>
    </div>
  );
}

export default function Home() {
  const [url, setUrl] = useState("");
  const [niche, setNiche] = useState("Podcast");
  const [clipLength, setClipLength] = useState(45);
  const [clipCount, setClipCount] = useState(6);
  const [clips, setClips] = useState<Clip[]>([]);
  const [audioPath, setAudioPath] = useState("");
  const [videoPath, setVideoPath] = useState<string | null>(null);
  const [hasVideo, setHasVideo] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [step, setStep] = useState(0);
  const [progress, setProgress] = useState(0);
  const [statusMsg, setStatusMsg] = useState("");
  const [error, setError] = useState("");
  const [expandedClip, setExpandedClip] = useState<number | null>(null);
  const [playingClip, setPlayingClip] = useState<number | null>(null);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [mediaObjectUrl, setMediaObjectUrl] = useState<string>("");
  const [exporting, setExporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const STEPS_LOG = [
    "Downloading video...",
    "Extracting & transcribing audio...",
    "Analysing for viral moments...",
    "Scoring and ranking clips...",
    "Finalising results...",
  ];

  async function handleProcess(file?: File) {
    setStep(1); setProgress(0); setError(""); setClips([]);

    if (file) {
      setUploadedFile(file);
      const objUrl = URL.createObjectURL(file);
      setMediaObjectUrl(objUrl);
      const ext = file.name.split(".").pop()?.toLowerCase() || "";
      setHasVideo(["mp4","mov","mkv","webm","avi"].includes(ext));
    } else {
      setUploadedFile(null);
      setMediaObjectUrl(`${API}/video`);
      setHasVideo(true);
    }

    let p = 0;
    const interval = setInterval(() => {
      p += Math.random() * 12;
      if (p > 90) p = 90;
      setProgress(Math.floor(p));
      setStatusMsg(STEPS_LOG[Math.min(Math.floor(p / 20), STEPS_LOG.length - 1)]);
    }, 900);

    try {
      let res;
      if (file) {
        const form = new FormData();
        form.append("file", file);
        form.append("clip_count", String(clipCount));
        form.append("clip_length", String(clipLength));
        form.append("niche", niche);
        res = await axios.post(`${API}/process-file`, form);
      } else {
        res = await axios.post(`${API}/process-url`, { url, clip_count: clipCount, clip_length: clipLength, niche });
      }

      clearInterval(interval);
      setProgress(100); setStatusMsg("Done!");

      setTimeout(() => {
        setClips(res.data.clips);
        setAudioPath(res.data.audio_path);
        setVideoPath(res.data.video_path);
        setHasVideo(res.data.has_video);
        if (!file) setMediaObjectUrl(`${API}/video`);
        setSelected(new Set(res.data.clips.map((_: Clip, i: number) => i)));
        setStep(2);
      }, 600);
    } catch (e: any) {
      clearInterval(interval);
      setError(e?.response?.data?.detail || "Something went wrong. Make sure backend is running on port 8000.");
      setStep(0);
    }
  }

  function toggleClip(i: number) {
    const s = new Set(selected);
    if (s.has(i)) s.delete(i); else s.add(i);
    setSelected(s);
  }

  async function handleExport() {
    if (exporting) return;
    setExporting(true);
    const selectedClips = clips.filter((_, i) => selected.has(i));
    try {
      const res = await fetch(`${API}/export`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audio_path: audioPath, video_path: videoPath, has_video: hasVideo, clips: selectedClips }),
      });
      if (!res.ok) {
        const err = await res.json();
        alert("Export failed: " + (err.detail || "Unknown error"));
        setExporting(false);
        return;
      }
      const blob = await res.blob();
      const dlUrl = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = dlUrl;
      a.download = hasVideo ? "clipfast_exports.zip" : "clipfast_audio_clips.zip";
      a.click();
    } catch (e) {
      alert("Export failed. Make sure the backend is running.");
    }
    setExporting(false);
  }

  const timeSaved = selected.size * 25;

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)" }}>

      {/* Player Modal */}
      {playingClip !== null && clips[playingClip] && (
        <PlayerModal
          clip={clips[playingClip]}
          mediaSrc={mediaObjectUrl || (hasVideo ? `${API}/video` : `${API}/audio`)}
          hasVideo={hasVideo}
          onClose={() => setPlayingClip(null)}
        />
      )}

      {/* Navbar */}
      <nav style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 32px", borderBottom: "1px solid var(--border)", background: "rgba(10,10,15,0.8)", backdropFilter: "blur(12px)", position: "sticky", top: 0, zIndex: 100 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: "linear-gradient(135deg, #6c63ff, #ff6584)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>⚡</div>
          <span className="font-display" style={{ fontSize: 18, fontWeight: 700, letterSpacing: "-0.02em" }}>ClipFast</span>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {step === 2 && (
            <button onClick={() => { setStep(0); setClips([]); setUrl(""); setUploadedFile(null); }}
              style={{ background: "var(--bg3)", border: "1px solid var(--border)", color: "var(--text2)", borderRadius: 8, padding: "7px 16px", fontSize: 13, cursor: "pointer" }}>
              + New project
            </button>
          )}
          <div style={{ background: "rgba(108,99,255,0.15)", border: "1px solid rgba(108,99,255,0.3)", color: "#a89cff", borderRadius: 8, padding: "7px 14px", fontSize: 13, fontFamily: "'Syne', sans-serif", fontWeight: 600 }}>
            Free plan · 3 videos left
          </div>
        </div>
      </nav>

      <main style={{ maxWidth: 760, margin: "0 auto", padding: "40px 20px" }}>

        {/* STEP 0 — Upload */}
        {step === 0 && (
          <div className="fade-in">
            <div style={{ textAlign: "center", marginBottom: 48 }}>
              <div style={{ display: "inline-block", background: "rgba(108,99,255,0.1)", border: "1px solid rgba(108,99,255,0.25)", borderRadius: 99, padding: "5px 16px", fontSize: 12, color: "#a89cff", fontFamily: "'Syne', sans-serif", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 20 }}>
                AI-Powered · Free to start
              </div>
              <h1 className="font-display" style={{ fontSize: "clamp(32px, 6vw, 52px)", fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.1, marginBottom: 16 }}>
                Turn long videos into<br /><span className="gradient-text">viral short clips</span>
              </h1>
              <p style={{ fontSize: 17, color: "var(--text2)", lineHeight: 1.6, maxWidth: 480, margin: "0 auto" }}>
                Paste a YouTube URL → AI finds your best moments → Download ready-to-post Reels, Shorts & TikToks
              </p>
            </div>

            <div style={{ marginBottom: 24 }}>
              <label style={{ fontSize: 12, color: "var(--text2)", fontFamily: "'Syne', sans-serif", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", display: "block", marginBottom: 10 }}>Your content type</label>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {NICHES.map((n) => (
                  <button key={n} onClick={() => setNiche(n)} style={{ padding: "8px 16px", borderRadius: 99, fontSize: 13, cursor: "pointer", border: niche === n ? "1px solid rgba(108,99,255,0.5)" : "1px solid var(--border)", background: niche === n ? "rgba(108,99,255,0.15)" : "var(--bg2)", color: niche === n ? "#a89cff" : "var(--text2)", fontFamily: niche === n ? "'Syne', sans-serif" : "inherit", fontWeight: niche === n ? 600 : 400, transition: "all 0.15s" }}>{n}</button>
                ))}
              </div>
            </div>

            {/* YouTube URL — Active */}
            <div style={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 16, padding: 24, marginBottom: 16 }}>
              <label style={{ fontSize: 12, color: "var(--text2)", fontFamily: "'Syne', sans-serif", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", display: "block", marginBottom: 12 }}>YouTube / Spotify URL</label>
              <div style={{ display: "flex", gap: 10 }}>
                <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://youtube.com/watch?v=..." onKeyDown={(e) => e.key === "Enter" && url && handleProcess()}
                  style={{ flex: 1, background: "var(--bg3)", border: "1px solid var(--border2)", borderRadius: 10, padding: "12px 16px", color: "var(--text)", fontSize: 14, outline: "none" }} />
                <button onClick={() => handleProcess()} disabled={!url}
                  style={{ background: url ? "linear-gradient(135deg, #6c63ff, #a89cff)" : "var(--bg3)", border: "none", borderRadius: 10, padding: "12px 24px", color: url ? "white" : "var(--text2)", fontSize: 14, fontFamily: "'Syne', sans-serif", fontWeight: 700, cursor: url ? "pointer" : "not-allowed", whiteSpace: "nowrap", transition: "all 0.15s" }}>
                  Generate clips ⚡
                </button>
              </div>
            </div>

            {/* File Upload */}
            <div onClick={() => fileRef.current?.click()}
              style={{ border: "1.5px dashed var(--border2)", borderRadius: 16, padding: "28px 20px", textAlign: "center", cursor: "pointer", background: "var(--bg2)", marginBottom: 24, transition: "border-color 0.15s" }}
              onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#6c63ff")}
              onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--border2)")}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>📁</div>
              <div style={{ fontSize: 14, color: "var(--text2)" }}>
                Or <span style={{ color: "#a89cff", fontWeight: 600 }}>upload a video or audio file</span> — MP4, MOV, MP3, WAV
              </div>
              <input ref={fileRef} type="file" accept="video/*,audio/*" style={{ display: "none" }}
                onChange={(e) => e.target.files?.[0] && handleProcess(e.target.files[0])} />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 24 }}>
              <div style={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 12, padding: 16 }}>
                <div style={{ fontSize: 11, color: "var(--text2)", fontFamily: "'Syne', sans-serif", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 10 }}>Clips to generate</div>
                <div style={{ display: "flex", gap: 6 }}>
                  {COUNTS.map((c) => (
                    <button key={c} onClick={() => setClipCount(c)} style={{ flex: 1, padding: "6px 0", borderRadius: 8, fontSize: 13, cursor: "pointer", border: clipCount === c ? "1px solid rgba(108,99,255,0.5)" : "1px solid var(--border)", background: clipCount === c ? "rgba(108,99,255,0.15)" : "var(--bg3)", color: clipCount === c ? "#a89cff" : "var(--text2)", fontWeight: clipCount === c ? 700 : 400 }}>{c}</button>
                  ))}
                </div>
              </div>
              <div style={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 12, padding: 16 }}>
                <div style={{ fontSize: 11, color: "var(--text2)", fontFamily: "'Syne', sans-serif", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 10 }}>Clip length</div>
                <div style={{ display: "flex", gap: 6 }}>
                  {LENGTHS.map((l) => (
                    <button key={l.val} onClick={() => setClipLength(l.val)} style={{ flex: 1, padding: "6px 0", borderRadius: 8, fontSize: 13, cursor: "pointer", border: clipLength === l.val ? "1px solid rgba(108,99,255,0.5)" : "1px solid var(--border)", background: clipLength === l.val ? "rgba(108,99,255,0.15)" : "var(--bg3)", color: clipLength === l.val ? "#a89cff" : "var(--text2)", fontWeight: clipLength === l.val ? 700 : 400 }}>{l.label}</button>
                  ))}
                </div>
              </div>
            </div>

            {error && (
              <div style={{ background: "rgba(255,101,132,0.1)", border: "1px solid rgba(255,101,132,0.3)", borderRadius: 10, padding: "12px 16px", color: "#ff8fab", fontSize: 13, marginBottom: 16 }}>
                ⚠️ {error}
              </div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
              {[{ label: "Avg time saved", value: "3.2 hrs" }, { label: "Clips generated", value: "50M+" }, { label: "Creator rating", value: "4.9 ★" }].map((s) => (
                <div key={s.label} style={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 12, padding: "14px 16px", textAlign: "center" }}>
                  <div className="font-display" style={{ fontSize: 22, fontWeight: 700, marginBottom: 2 }}>{s.value}</div>
                  <div style={{ fontSize: 11, color: "var(--text2)" }}>{s.label}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* STEP 1 — Processing */}
        {step === 1 && (
          <div className="fade-in" style={{ textAlign: "center", paddingTop: 40 }}>
            <div style={{ width: 80, height: 80, borderRadius: "50%", margin: "0 auto 24px", background: "rgba(108,99,255,0.1)", border: "2px solid rgba(108,99,255,0.3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32 }}>⚡</div>
            <h2 className="font-display" style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>AI is working on it</h2>
            <p style={{ color: "var(--text2)", marginBottom: 40, fontSize: 15 }}>Finding your most viral moments...</p>
            <div style={{ maxWidth: 480, margin: "0 auto 12px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "var(--text2)", marginBottom: 8 }}>
                <span>{statusMsg}</span><span>{progress}%</span>
              </div>
              <div style={{ height: 6, background: "var(--bg3)", borderRadius: 99, overflow: "hidden" }}>
                <div className="shimmer" style={{ height: "100%", width: `${progress}%`, borderRadius: 99, transition: "width 0.4s ease" }} />
              </div>
            </div>
            <div style={{ maxWidth: 440, margin: "32px auto 0", background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 12, padding: 16, textAlign: "left" }}>
              {STEPS_LOG.map((s, i) => {
                const stepIdx = Math.floor(progress / 20);
                const done = i < stepIdx; const active = i === stepIdx;
                return (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0", opacity: done || active ? 1 : 0.3, borderBottom: i < STEPS_LOG.length - 1 ? "1px solid var(--border)" : "none", fontSize: 13 }}>
                    <span style={{ fontSize: 14 }}>{done ? "✅" : active ? "⏳" : "○"}</span>{s}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* STEP 2 — Results */}
        {step === 2 && (
          <div className="fade-in">
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
              <div>
                <h2 className="font-display" style={{ fontSize: 28, fontWeight: 700, marginBottom: 4 }}>{clips.length} clips ready ✨</h2>
                <p style={{ color: "var(--text2)", fontSize: 14 }}>
                  Click ▶ to {hasVideo ? "watch" : "hear"} preview · {selected.size} selected · ~{timeSaved} min saved
                </p>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => setSelected(selected.size === clips.length ? new Set() : new Set(clips.map((_, i) => i)))}
                  style={{ background: "var(--bg2)", border: "1px solid var(--border)", color: "var(--text2)", borderRadius: 8, padding: "9px 16px", fontSize: 13, cursor: "pointer" }}>
                  {selected.size === clips.length ? "Deselect all" : "Select all"}
                </button>
                <button onClick={handleExport} disabled={exporting}
                  style={{ background: exporting ? "var(--bg3)" : "linear-gradient(135deg, #6c63ff, #a89cff)", border: "none", color: exporting ? "var(--text2)" : "white", borderRadius: 8, padding: "9px 20px", fontSize: 13, fontFamily: "'Syne', sans-serif", fontWeight: 700, cursor: exporting ? "not-allowed" : "pointer", transition: "all 0.2s", minWidth: 140 }}>
                  {exporting ? "⏳ Exporting..." : `Export ${selected.size} clips ↓`}
                </button>
              </div>
            </div>

            {/* Media type badge */}
            <div style={{ marginBottom: 16 }}>
              <span style={{ fontSize: 12, background: hasVideo ? "rgba(67,233,123,0.1)" : "rgba(108,99,255,0.1)", color: hasVideo ? "#43e97b" : "#a89cff", border: `1px solid ${hasVideo ? "rgba(67,233,123,0.3)" : "rgba(108,99,255,0.3)"}`, borderRadius: 99, padding: "3px 12px" }}>
                {hasVideo ? "🎬 Video clips — exports as .mp4" : "🎵 Audio clips — exports as .mp3"}
              </span>
            </div>

            <div style={{ background: "rgba(67,233,123,0.08)", border: "1px solid rgba(67,233,123,0.2)", borderRadius: 10, padding: "12px 16px", marginBottom: 20, display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: "#43e97b" }}>
              <span style={{ fontSize: 18 }}>⏱</span>
              <span><strong>{timeSaved} minutes</strong> of manual editing saved this session</span>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {clips.map((clip, i) => (
                <div key={i} style={{ background: selected.has(i) ? "rgba(108,99,255,0.08)" : "var(--bg2)", border: selected.has(i) ? "1.5px solid rgba(108,99,255,0.4)" : "1px solid var(--border)", borderRadius: 14, overflow: "hidden", transition: "all 0.15s" }}>

                  {/* Thumbnail — click to preview */}
                  <div onClick={() => setPlayingClip(i)}
                    style={{ height: 90, background: `linear-gradient(135deg, ${TAG_COLORS[clip.tag] || "rgba(108,99,255,0.1)"} 0%, var(--bg3) 100%)`, display: "flex", alignItems: "center", justifyContent: "center", position: "relative", cursor: "pointer" }}>
                    <div style={{ width: 42, height: 42, borderRadius: "50%", background: "rgba(108,99,255,0.9)", border: "2px solid rgba(255,255,255,0.2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, color: "white", boxShadow: "0 4px 20px rgba(108,99,255,0.4)" }}>▶</div>
                    <div style={{ position: "absolute", top: 8, right: 8 }}><ScoreBadge score={clip.score} /></div>
                    <div style={{ position: "absolute", bottom: 8, left: 10, fontSize: 11, color: "rgba(255,255,255,0.7)", background: "rgba(0,0,0,0.4)", padding: "2px 8px", borderRadius: 99 }}>
                      {formatTime(clip.start)} – {formatTime(clip.end)}
                    </div>
                    {selected.has(i) && (
                      <div style={{ position: "absolute", top: 8, left: 8, width: 20, height: 20, borderRadius: "50%", background: "#6c63ff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: "white" }}>✓</div>
                    )}
                  </div>

                  {/* Card body — click to select */}
                  <div onClick={() => toggleClip(i)} style={{ padding: "12px 14px", cursor: "pointer" }}>
                    <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 8, lineHeight: 1.4, color: "var(--text)" }}>{clip.title}</div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <span style={{ fontSize: 11, color: "var(--text2)" }}>{formatTime(clip.start)} – {formatTime(clip.end)}</span>
                      <span style={{ background: TAG_COLORS[clip.tag] || "rgba(108,99,255,0.1)", color: TAG_TEXT[clip.tag] || "#a89cff", fontSize: 11, padding: "2px 10px", borderRadius: 99, fontFamily: "'Syne', sans-serif", fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase" }}>
                        {clip.tag}
                      </span>
                    </div>
                    <div onClick={(e) => { e.stopPropagation(); setExpandedClip(expandedClip === i ? null : i); }} style={{ marginTop: 8 }}>
                      <span style={{ fontSize: 11, color: "#6c63ff", cursor: "pointer" }}>{expandedClip === i ? "▲ Hide reason" : "▼ Why this clip?"}</span>
                      {expandedClip === i && <p style={{ fontSize: 12, color: "var(--text2)", marginTop: 6, lineHeight: 1.5 }}>{clip.reason}</p>}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ marginTop: 24, background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 14, padding: 20 }}>
              <div style={{ fontSize: 13, fontFamily: "'Syne', sans-serif", fontWeight: 700, marginBottom: 14, color: "var(--text2)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Publish to</div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                {[{ name: "TikTok", icon: "🎵" }, { name: "Instagram Reels", icon: "📸" }, { name: "YouTube Shorts", icon: "▶️" }, { name: "LinkedIn", icon: "💼" }].map((p) => (
                  <button key={p.name} style={{ display: "flex", alignItems: "center", gap: 7, background: "var(--bg3)", border: "1px solid var(--border2)", borderRadius: 8, padding: "8px 14px", fontSize: 13, color: "var(--text2)", cursor: "pointer" }}>
                    <span>{p.icon}</span>{p.name}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}