import { useState, useRef } from "react";
import Papa from "papaparse";

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY || "AIzaSyB1cwIxvxQP0lXTEs8TZtFQVkIJCft7iQQ";
const SENDER_EMAIL = import.meta.env.VITE_SENDER_EMAIL || "rohitxsahni046@gmail.com";

// Tries each model in order — first one that works wins
const GEMINI_MODELS = [
  "gemini-2.5-flash-preview-04-17",
  "gemini-2.5-flash-preview-05-20",
  "gemini-2.5-flash",
  "gemini-2.0-flash-lite",
  "gemini-1.5-flash-latest",
  "gemini-1.5-flash",
];

export default function App() {
  const [csvData, setCsvData] = useState(null);
  const [fileName, setFileName] = useState("");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [phase, setPhase] = useState("idle");
  const [geminiResult, setGeminiResult] = useState(null);
  const [error, setError] = useState("");
  const [statusMsg, setStatusMsg] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef();

  const parseCSV = (file) =>
    new Promise((res, rej) => {
      Papa.parse(file, { header: true, skipEmptyLines: true, complete: res, error: rej });
    });

  const handleFile = async (file) => {
    if (!file?.name.endsWith(".csv")) { setError("Please upload a valid .csv file."); return; }
    setError(""); setPhase("parsing"); setFileName(file.name); setGeminiResult(null);
    try {
      const result = await parseCSV(file);
      setCsvData(result);
      setPhase("ready");
    } catch {
      setError("Failed to parse CSV file.");
      setPhase("error");
    }
  };

  const handleDrop = (e) => {
    e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0]);
  };

  // Smart sampling — sends representative rows to Gemini
  const sampleRows = (rows) => {
    if (rows.length <= 300) return rows;
    const first = rows.slice(0, 100);
    const last = rows.slice(-100);
    const middle = rows.slice(100, rows.length - 100);
    const step = Math.max(1, Math.floor(middle.length / 100));
    const mid = middle.filter((_, i) => i % step === 0).slice(0, 100);
    return [...first, ...mid, ...last];
  };

  const callGemini = async (rows, fields) => {
    const totalRows = rows.length;
    const sampled = sampleRows(rows);
    const csvText = [fields.join(","), ...sampled.map((r) => fields.map((f) => r[f] ?? "").join(","))].join("\n");

    const prompt = `You are an expert data analyst. Total dataset: ${totalRows} rows, ${fields.length} columns. Sample: ${sampled.length} rows.

Respond in EXACTLY this format:

SUMMARY:
[3-4 sentences about what this data is, scope, and key characteristics. Mention ${totalRows} total rows.]

INSIGHTS:
- [Insight 1 with specific numbers]
- [Insight 2 with specific numbers]
- [Insight 3 with specific numbers]
- [Insight 4 with specific numbers]
- [Insight 5 with specific numbers]

HTML_TABLE:
[HTML summary table using ONLY <table><thead><tr><th><tbody><td> tags. Columns: Metric | Value | Notes. Include: total rows, columns, data types, stats per column.]

CSV SAMPLE:
${csvText}`;

    let lastError = "All Gemini models failed. Check API key quota at aistudio.google.com/apikey";

    for (const model of GEMINI_MODELS) {
      try {
        setStatusMsg(`Trying model: ${model}...`);
        console.log("Trying:", model);

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 55000);

        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            signal: controller.signal,
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: { temperature: 0.3, maxOutputTokens: 2048 },
            }),
          }
        );
        clearTimeout(timer);

        // Read body as text first to avoid JSON parse crash on empty responses
        const rawBody = await res.text().catch(() => "");
        if (!rawBody.trim()) { lastError = `${model} returned empty body`; continue; }

        let resData;
        try { resData = JSON.parse(rawBody); }
        catch (jsonErr) { lastError = `${model} invalid JSON: ${jsonErr.message}`; continue; }

        if (!res.ok) {
          lastError = resData?.error?.message || `${model} HTTP ${res.status}`;
          console.warn("Failed:", model, lastError);
          continue;
        }

        const text = resData.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!text) { lastError = `${model} returned empty content`; continue; }

        console.log("SUCCESS with:", model);
        setStatusMsg("");

        const summaryM = text.match(/SUMMARY:\s*([\s\S]*?)(?=INSIGHTS:|HTML_TABLE:|$)/i);
        const insightsM = text.match(/INSIGHTS:\s*([\s\S]*?)(?=HTML_TABLE:|$)/i);
        const tableM = text.match(/HTML_TABLE:\s*([\s\S]*?)(?=CSV SAMPLE:|$)/i);

        return {
          summary: summaryM?.[1]?.trim() || "Analysis complete.",
          insights: (insightsM?.[1]?.trim() || "").split("\n").filter((l) => l.trim().match(/^[-*]/)).slice(0, 6),
          tableHtml: tableM?.[1]?.trim() || "<table><tr><td>See summary above</td></tr></table>",
        };
      } catch (e) {
        lastError = e.name === "AbortError" ? `${model} timed out` : e.message;
        console.warn("Error:", model, lastError);
      }
    }

    setStatusMsg("");
    throw new Error(lastError);
  };

  const sendEmail = async (result) => {
    const res = await fetch("/api/send-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to: recipientEmail,
        subject: `CSV Analysis Report — ${fileName}`,
        html: buildEmailHtml(result),
      }),
    });
    const raw = await res.text().catch(() => "{}");
    let data;
    try { data = raw ? JSON.parse(raw) : {}; } catch { data = {}; }
    if (!res.ok) throw new Error(data.error || `Email API error ${res.status}`);
    return data;
  };

  const buildEmailHtml = (result) => `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><style>
*{box-sizing:border-box;margin:0;padding:0}body{font-family:'Segoe UI',Arial,sans-serif;background:#f0f4f8;padding:30px 16px;color:#1a202c}
.w{max-width:680px;margin:0 auto}.h{background:linear-gradient(135deg,#0f172a,#1e3a8a);color:#fff;padding:32px 36px;border-radius:16px 16px 0 0}
.h h1{font-size:22px;font-weight:700;margin-bottom:6px}.h p{font-size:13px;opacity:.65}
.b{background:#fff;border:1px solid #e2e8f0;border-top:none;padding:32px 36px}.s{margin-bottom:28px}
.t{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:#3b82f6;margin-bottom:12px}
.sb{background:#eff6ff;border-left:4px solid #3b82f6;padding:16px 18px;border-radius:8px;font-size:14px;line-height:1.7;color:#1e293b}
.ins{display:flex;gap:10px;padding:10px 14px;background:#f8fafc;border-radius:8px;margin-bottom:7px;border-left:3px solid #3b82f6;font-size:13px;line-height:1.6;color:#334155}
table{width:100%;border-collapse:collapse;font-size:13px}th{background:#1e3a8a;color:#fff;padding:10px 14px;text-align:left;font-weight:600}
td{padding:9px 14px;border-bottom:1px solid #e2e8f0;color:#374151}tr:nth-child(even) td{background:#f8fafc}
.f{background:#f8fafc;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 16px 16px;padding:16px;text-align:center;font-size:12px;color:#94a3b8}
.badge{background:#dbeafe;color:#1d4ed8;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:600;margin:0 3px}
</style></head><body><div class="w">
<div class="h"><h1>CSV Analysis Report</h1><p>File: <strong>${fileName}</strong> • ${new Date().toLocaleString()} • Gemini AI</p></div>
<div class="b">
<div class="s"><div class="t">Dataset Summary</div><div class="sb">${result.summary}</div></div>
<div class="s"><div class="t">Key Insights</div>${result.insights.map((i) => `<div class="ins"><span style="color:#3b82f6;font-weight:700">›</span><span>${i.replace(/^[-*]\s*/, "")}</span></div>`).join("")}</div>
<div class="s"><div class="t">Data Summary Table</div>${result.tableHtml}</div>
</div>
<div class="f"><span class="badge">Gemini AI</span><span class="badge">${fileName}</span><br><br>Sent from ${SENDER_EMAIL}</div>
</div></body></html>`;

  const handleRun = async () => {
    if (!csvData) { setError("Please upload a CSV file first."); return; }
    if (!recipientEmail || !recipientEmail.includes("@")) { setError("Enter a valid recipient email."); return; }
    setError("");
    try {
      setPhase("analyzing");
      const result = await callGemini(csvData.data, csvData.meta.fields);
      setGeminiResult(result);
      setPhase("sending");
      await sendEmail(result);
      setPhase("success");
    } catch (e) {
      setError(e.message || "Something went wrong.");
      setPhase("error");
    }
  };

  const reset = () => {
    setCsvData(null); setFileName(""); setRecipientEmail("");
    setPhase("idle"); setGeminiResult(null); setError(""); setStatusMsg("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const isLoading = ["parsing", "analyzing", "sending"].includes(phase);

  return (
    <div className="page">
      <div className="container">
        <header className="hero">
          <div className="hero-badge"><span className="dot-pulse" />Gemini AI Powered</div>
          <h1>CSV <span className="gradient-text">Analyzer</span></h1>
          <p className="subtitle">Upload any CSV → AI analysis → Report delivered to any inbox</p>
          <div className="tech-pills">
            {["Gemini AI", "Nodemailer", "React + Vite", "Vercel"].map((t) => <span key={t} className="tech-pill">{t}</span>)}
          </div>
        </header>

        {phase === "success" ? (
          <div className="card success-card">
            <div className="success-icon">✅</div>
            <h2>Report Delivered!</h2>
            <p className="success-sub">Analysis sent to <strong>{recipientEmail}</strong></p>
            {geminiResult && (
              <div className="result-preview">
                <div className="result-section">
                  <div className="label">Summary</div>
                  <p className="summary-text">{geminiResult.summary}</p>
                </div>
                <div className="result-section">
                  <div className="label">Key Insights</div>
                  {geminiResult.insights.map((ins, i) => (
                    <div className="insight-row" key={i}><span className="chevron">›</span><span>{ins.replace(/^[-*]\s*/, "")}</span></div>
                  ))}
                </div>
              </div>
            )}
            <button className="btn-secondary" onClick={reset}>← Analyze Another File</button>
          </div>
        ) : (
          <div className="flow">
            <div className="card">
              <div className="step-header">
                <div className={`step-num ${csvData ? "done" : ""}`}>{csvData ? "✓" : "1"}</div>
                <div><div className="step-title">Upload CSV File</div><div className="step-desc">Drag & drop or click to browse</div></div>
                {csvData && <div className="file-badge">📄 {fileName}</div>}
              </div>
              {!csvData ? (
                <div className={`dropzone ${dragOver ? "active" : ""}`}
                  onDrop={handleDrop}
                  onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onClick={() => fileInputRef.current?.click()}>
                  <input ref={fileInputRef} type="file" accept=".csv" style={{ display: "none" }} onChange={(e) => handleFile(e.target.files[0])} />
                  {phase === "parsing"
                    ? <><div className="spinner" /><p>Parsing CSV...</p></>
                    : <><div className="upload-icon">📁</div><p className="upload-text">Drop CSV here or <span className="link">browse</span></p><p className="upload-hint">Supports any .csv file • Any size</p></>}
                </div>
              ) : (
                <div className="preview-box">
                  <div className="preview-meta">
                    <span><strong>{csvData.data.length}</strong> rows</span>
                    <span><strong>{csvData.meta.fields.length}</strong> columns</span>
                    <button className="remove-btn" onClick={() => { setCsvData(null); setFileName(""); setPhase("idle"); }}>✕ Remove</button>
                  </div>
                  <div className="table-scroll">
                    <table className="preview-table">
                      <thead><tr>
                        {csvData.meta.fields.slice(0, 6).map((f) => <th key={f}>{f}</th>)}
                        {csvData.meta.fields.length > 6 && <th>+{csvData.meta.fields.length - 6} more</th>}
                      </tr></thead>
                      <tbody>
                        {csvData.data.slice(0, 5).map((row, i) => (
                          <tr key={i}>
                            {csvData.meta.fields.slice(0, 6).map((f) => <td key={f}>{String(row[f] ?? "").slice(0, 28)}</td>)}
                            {csvData.meta.fields.length > 6 && <td className="muted">…</td>}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            <div className={`card ${!csvData ? "disabled" : ""}`}>
              <div className="step-header">
                <div className={`step-num ${recipientEmail && csvData ? "done" : ""}`}>{recipientEmail && csvData ? "✓" : "2"}</div>
                <div><div className="step-title">Recipient Email</div><div className="step-desc">Where to send the analysis report</div></div>
              </div>
              <input className="email-input" type="email" placeholder="recipient@example.com"
                value={recipientEmail} onChange={(e) => setRecipientEmail(e.target.value)} disabled={!csvData} />
              <div className="sender-info">Sending from: <span>{SENDER_EMAIL}</span></div>
            </div>

            {csvData && recipientEmail && (
              <div className="card pipeline-card">
                <div className="pipeline-title">🔄 Pipeline Preview</div>
                <div className="pipeline">
                  <div className="pipe-step"><div className="pipe-icon">📄</div><div className="pipe-label">CSV File</div><div className="pipe-val">{fileName}</div></div>
                  <div className="pipe-arrow">→</div>
                  <div className="pipe-step"><div className="pipe-icon">🤖</div><div className="pipe-label">Gemini AI</div><div className="pipe-val">Auto-select model</div></div>
                  <div className="pipe-arrow">→</div>
                  <div className="pipe-step"><div className="pipe-icon">📧</div><div className="pipe-label">Email</div><div className="pipe-val">{recipientEmail}</div></div>
                </div>
              </div>
            )}

            {error && (
              <div className="error-box">
                <span>⚠️</span>
                <div><strong>Error:</strong> {error}</div>
              </div>
            )}

            {isLoading && (
              <div className="loading-box">
                <div className="spinner" />
                <div>
                  <div className="loading-title">
                    {phase === "analyzing" ? "Gemini is analyzing your data..." : "Sending report via Gmail..."}
                  </div>
                  <div className="loading-sub">
                    {statusMsg || (phase === "analyzing" ? "Auto-selecting best available Gemini model..." : "Composing HTML email and dispatching...")}
                  </div>
                </div>
              </div>
            )}

            <button className="btn-primary" onClick={handleRun} disabled={!csvData || !recipientEmail || isLoading}>
              {phase === "analyzing" ? "⏳ Analyzing with Gemini..."
                : phase === "sending" ? "📨 Sending Email..."
                : "🚀 Analyze & Send Report"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}