import React, { useEffect, useRef, useState } from "react";


const API_BASE =
  process.env.REACT_APP_API_URL?.replace(/\/$/, "") || "http://localhost:5000";

const formatTime = (s) =>
  `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

export default function App() {
  const [isRecording, setIsRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [blobUrl, setBlobUrl] = useState(null);
  const [blobObj, setBlobObj] = useState(null);
  const [mediaRecorder, setMediaRecorder] = useState(null);
  const [recordings, setRecordings] = useState([]);
  const [error, setError] = useState("");

  const timerRef = useRef(null);
  const streamsRef = useRef([]);

  // Load list
  const fetchRecordings = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/recordings`);
      const data = await res.json();
      setRecordings(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error(e);
    }
  };
  useEffect(() => {
    fetchRecordings();
  }, []);

  // Start screen + mic recording
  const startRecording = async () => {
    setError("");
    try {
      // 1) Get screen (tab) with video
      const display = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 30 },
        audio: true, // some browsers provide tab audio
      });
      // 2) Get microphone
      const mic = await navigator.mediaDevices.getUserMedia({ audio: true });

      // 3) Merge: video from display + audio from mic
      const mixedStream = new MediaStream([
        ...display.getVideoTracks(),
        ...mic.getAudioTracks(),
      ]);

      const chunks = [];
      const mr = new MediaRecorder(mixedStream, { mimeType: "video/webm;codecs=vp9,opus" });

      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };
      mr.onstop = () => {
        const blob = new Blob(chunks, { type: "video/webm" });
        const url = URL.createObjectURL(blob);
        setBlobObj(blob);
        setBlobUrl(url);
      };

      // Keep refs to stop later
      streamsRef.current = [display, mic, mixedStream];

      mr.start(250); // small timeslice for quick availability
      setMediaRecorder(mr);
      setIsRecording(true);
      setSeconds(0);

      // Timer: stop at 180s
      timerRef.current = setInterval(() => {
        setSeconds((s) => {
          if (s + 1 >= 180) {
            stopRecording();
          }
          return s + 1;
        });
      }, 1000);
    } catch (e) {
      console.error(e);
      setError(e.message || "Failed to start recording");
    }
  };

  // Stop recording + cleanup tracks
  const stopRecording = () => {
    if (!mediaRecorder) return;
    try {
      mediaRecorder.stop();
      setIsRecording(false);
      clearInterval(timerRef.current);
      streamsRef.current.forEach((s) =>
        s.getTracks().forEach((t) => t.stop())
      );
      streamsRef.current = [];
    } catch (e) {
      console.error(e);
    }
  };

  const resetPreview = () => {
    if (blobUrl) URL.revokeObjectURL(blobUrl);
    setBlobUrl(null);
    setBlobObj(null);
    setSeconds(0);
  };

  // Download .webm locally
  const downloadWebm = () => {
    if (!blobUrl) return;
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = `recording_${Date.now()}.webm`;
    a.click();
  };

  // Upload to backend
  const uploadRecording = async () => {
    try {
      if (!blobObj) return;
      const fd = new FormData();
      fd.append("video", blobObj, `recording_${Date.now()}.webm`);
      const res = await fetch(`${API_BASE}/api/recordings`, {
        method: "POST",
        body: fd,
      });
      if (!res.ok) throw new Error("Upload failed");
      await fetchRecordings();
      alert("Uploaded!");
    } catch (e) {
      alert(e.message || "Upload failed");
    }
  };

  return (
    <div className="min-h-screen px-4 py-10 sm:px-8 md:px-12">
      <div className="max-w-4xl mx-auto">
        <header className="flex items-center justify-between mb-6">
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
            🎬 Screen Recorder
          </h1>
          <a
            href={`${API_BASE}/health`}
            className="text-xs opacity-70 hover:opacity-100"
            target="_blank"
            rel="noreferrer"
          >
            Backend Health
          </a>
        </header>

        {/* Controls */}
        <div className="bg-[#111827] border border-white/10 rounded-2xl p-5 shadow-lg">
          <div className="flex flex-wrap items-center gap-3">
            {!isRecording ? (
              <button
                onClick={startRecording}
                className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 font-semibold"
              >
                Start Recording
              </button>
            ) : (
              <button
                onClick={stopRecording}
                className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 font-semibold"
              >
                Stop ({formatTime(seconds)})
              </button>
            )}

            <div className="ml-auto text-sm opacity-80">
              Max duration: <span className="font-mono">03:00</span>
            </div>
          </div>

          {error && (
            <p className="mt-3 text-sm text-rose-400">Error: {error}</p>
          )}
        </div>

        {/* Preview */}
        {blobUrl && (
          <div className="mt-6 bg-[#0f172a] border border-white/10 rounded-2xl p-5">
            <h2 className="text-lg font-semibold mb-3">Preview</h2>
            <video
              src={blobUrl}
              controls
              className="w-full rounded-xl border border-white/10"
            />
            <div className="flex flex-wrap gap-3 mt-4">
              <button
                onClick={downloadWebm}
                className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 font-semibold"
              >
                Download .webm
              </button>
              <button
                onClick={uploadRecording}
                className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 font-semibold"
              >
                Upload to Backend
              </button>
              <button
                onClick={resetPreview}
                className="px-4 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 font-semibold"
              >
                Discard
              </button>
            </div>
          </div>
        )}

        {/* List */}
        <div className="mt-8">
          <h2 className="text-lg font-semibold mb-3">Uploaded Recordings</h2>
          {recordings.length === 0 ? (
            <p className="opacity-70 text-sm">No recordings yet.</p>
          ) : (
            <ul className="space-y-4">
              {recordings.map((r) => (
                <li
                  key={r.id}
                  className="bg-[#0f172a] border border-white/10 rounded-2xl p-4"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-sm">
                      <div className="font-semibold">{r.filename}</div>
                      <div className="opacity-70">
                        {(r.filesize / (1024 * 1024)).toFixed(2)} MB ·{" "}
                        {new Date(r.createdAt).toLocaleString()}
                      </div>
                    </div>
                    <a
                      className="text-blue-400 hover:text-blue-300 text-sm underline"
                      href={`${API_BASE}/api/recordings/${r.id}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open Direct
                    </a>
                  </div>
                  <video
                    className="w-full rounded-lg border border-white/10"
                    controls
                    src={`${API_BASE}/api/recordings/${r.id}`}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>

        <footer className="mt-10 opacity-60 text-xs">
          Tip: Chrome sometimes asks twice for permissions (screen + microphone).
          Allow both to capture your voice with the tab video.
        </footer>
      </div>
    </div>
  );
}
