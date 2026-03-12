# 📊 CSV Analyzer — AI Powered

Upload any CSV → Gemini AI analyzes it → Beautiful HTML report sent to any email inbox.

## Tech Stack
- **Frontend**: React 18 + Vite
- **AI**: Google Gemini 1.5 Flash
- **Email**: Nodemailer (Gmail SMTP)
- **Deploy**: Vercel

---

## 🚀 Run Locally

### Step 1 — Clone / unzip the project
```bash
cd csv-analyzer
```

### Step 2 — Install dependencies
```bash
npm install
```

### Step 3 — Set up environment variables
```bash
cp .env.example .env
```

Open `.env` and fill in your Gmail App Password:
```
EMAIL_PASS=your_16_char_app_password
```

**How to get Gmail App Password:**
1. Go to [myaccount.google.com](https://myaccount.google.com)
2. **Security** → **2-Step Verification** → Enable it
3. **Security** → **App Passwords**
4. Select App: **Mail**, Device: **Other** → Name it "CSV Analyzer"
5. Copy the 16-character password → paste into `.env`

### Step 4 — Start dev server
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) ✅

---

## ☁️ Deploy to Vercel

### Option A — Vercel CLI (recommended)
```bash
npm install -g vercel
vercel
```

Follow the prompts. When asked about environment variables, add them in the Vercel dashboard.

### Option B — GitHub + Vercel Dashboard
1. Push this folder to a GitHub repo
2. Go to [vercel.com](https://vercel.com) → **New Project** → Import your repo
3. Vercel auto-detects Vite ✅
4. Add environment variables in **Project Settings → Environment Variables**:
   - `EMAIL_USER` = rohitxsahni046@gmail.com
   - `EMAIL_PASS` = your 16-char app password
   - `VITE_GEMINI_API_KEY` = your Gemini key
   - `VITE_SENDER_EMAIL` = rohitxsahni046@gmail.com
5. Click **Deploy** 🚀

---

## 📁 Project Structure
```
csv-analyzer/
├── api/
│   └── send-email.js     ← Vercel serverless function (Nodemailer)
├── src/
│   ├── App.jsx           ← Main React component
│   ├── main.jsx          ← Entry point
│   └── index.css         ← Styles
├── index.html
├── package.json
├── vite.config.js
├── vercel.json
└── .env.example
```

---

## ⚙️ How It Works
1. User uploads a CSV file — parsed client-side with PapaParse
2. CSV data sent to Gemini 1.5 Flash API → returns summary + insights + HTML table
3. App calls `/api/send-email` (Vercel serverless function)
4. Nodemailer sends a beautiful HTML email via Gmail SMTP
