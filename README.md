<img width="1919" height="908" alt="image" src="https://github.com/user-attachments/assets/1eb25c30-65a4-4dec-b676-d8c1a10199fc" />
# Vocalize AI — Karan's Call Agent

A real-time AI voice agent with **animated Live2D avatars**, **SIP phone calling**, **web search**, and **email capabilities** — built on **LiveKit Cloud**, **Groq LLM**, and **Deepgram / Sarvam AI** for speech processing.

![Vocalize AI](https://img.shields.io/badge/Vocalize-AI-rose?style=for-the-badge)
![LiveKit](https://img.shields.io/badge/LiveKit-Cloud-blue?style=for-the-badge)
![Groq](https://img.shields.io/badge/Groq-LLM-green?style=for-the-badge)
![Deepgram](https://img.shields.io/badge/Deepgram-STT%2FTTS-purple?style=for-the-badge)
![Sarvam AI](https://img.shields.io/badge/Sarvam-AI-orange?style=for-the-badge)

## ✨ Features

### 🎙️ Core Voice
- **Real-time Voice Conversation** — Natural back-and-forth dialogue with interruption support
- **Groq LLM** — Ultra-fast inference (OpenAI GPT-OSS 120B)
- **Deepgram Nova-3 STT/TTS** — High-quality speech recognition and synthesis for WebRTC
- **Sarvam AI STT/TTS** — Indian language support with Hindi TTS (Vidhya voice) for SIP calls
- **Hybrid TTS Routing** — Automatic language-based TTS selection (English → Deepgram, Hindi → Sarvam)
- **Noise Cancellation** — Built-in BVC for clean audio
- **Silero VAD** — Accurate voice activity detection
- **Live Transcription** — Real-time transcripts displayed in UI

<img width="1919" height="915" alt="image" src="https://github.com/user-attachments/assets/9f29c25e-958c-4abf-b565-d75a5001a5f5" />

### 🎭 Live2D Animated Avatars
- **Multiple Selectable Avatars** — Choose from 3 unique Live2D characters:
  - **Huohuo** — Full animations with speaking motions
  - **Nimshiha** — Elegant design with expressions
  - **Demon Girl** — Demon-themed with special expressions
- **Audio-driven Lip Sync** — FFT frequency analysis for realistic mouth movements
- **Avatar Gestures** — Agent-triggered actions via tool calls:
  - `wave` — Wave hello/goodbye
  - `nod` — Nod in agreement
  - `wink` — Playful wink
  - `wagtail` — Show excitement
- **Mouse Tracking** — Eye-follow interactions
- **Click Interactions** — Tap the avatar for random motions
- **Persistent Selection** — Avatar choice saved to localStorage

### 📞 SIP Phone Calling
- **Inbound SIP Calls** — Receive real phone calls via LiveKit SIP trunk
- **Automatic SIP Detection** — Identifies phone participants vs WebRTC users
- **Phone-specific Persona** — Custom instructions for phone calls (configurable via env var)
- **Sarvam AI for Phone** — Optimized Indian accent recognition for SIP callers

  <img width="1901" height="893" alt="image" src="https://github.com/user-attachments/assets/cad24408-5814-49ef-b7a7-3fc9e7ab0edc" />

### 🔍 AI Tools
- **Web Search** — Real-time search via Tavily (news, weather, stocks, sports)
- **Webpage Reading** — Extract and summarize content from any URL
- **Styled HTML Email** — Send branded dark-theme emails via Resend API
- **Research Email** — Search a topic + email results with sources and images
- **Email Input Popup** — Agent triggers a frontend popup for email collection (no verbal ask)
- **End Call** — Graceful call termination on user goodbye

  <img width="1919" height="916" alt="image" src="https://github.com/user-attachments/assets/c00ca26d-7718-41e2-af37-588d502e7a0b" />

### 📊 Analytics & Logging
- **Notion Conversation Logger** — Full transcripts auto-saved to a Notion database
- **Google Sheets User Tracking** — Log every connecting user with timestamps
- **Session Banners** — Visual start/end banners in Railway logs with duration tracking

  <img width="1919" height="905" alt="image" src="https://github.com/user-attachments/assets/39cad635-c8c8-487b-9a9b-1df7e2090037" />

### 🎨 UI/UX
- **Premium Dark Theme** — Stone/rose palette with Manrope + Satisfy fonts
- **Smoke Text Animation** — Blur-fade-in effect on status text
- **Beam Border Effect** — Animated conic-gradient hover borders
- **Sound Effects** — Audio cues for call start, call end, tool use, and thinking states
- **Customizable Agent Persona** — Settings modal to define personality and business context
- **PWA Support** — Installable as a Progressive Web App with manifest and icons
- **Responsive Design** — Optimized for desktop and mobile

## 🏗️ Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                     Frontend (Vercel / PWA)                       │
│  ┌───────────┐  ┌──────────────┐  ┌─────────────┐  ┌─────────┐ │
│  │  React UI │  │ Live2D Avatar│  │ LiveKit SDK  │  │ /api/*  │ │
│  │  (App.tsx)│  │ (PixiJS)     │  │ (WebRTC)     │  │ token   │ │
│  └───────────┘  └──────────────┘  └──────────────┘  │ sheets  │ │
│                                                      └─────────┘ │
└──────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│                        LiveKit Cloud                              │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  WebRTC Media Server  •  SIP Trunk  •  Data Channels       │  │
│  └────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│                    Backend Agent (Railway)                        │
│  ┌──────────┐  ┌───────────┐  ┌───────────┐  ┌──────────────┐  │
│  │ Groq LLM │  │ Deepgram  │  │ Sarvam AI │  │ Silero VAD   │  │
│  │ (GPT-OSS)│  │ STT / TTS │  │ STT / TTS │  │              │  │
│  └──────────┘  └───────────┘  └───────────┘  └──────────────┘  │
│  ┌──────────┐  ┌───────────┐  ┌───────────┐  ┌──────────────┐  │
│  │ Tavily   │  │ Resend    │  │ Notion    │  │ Noise Cancel │  │
│  │ (Search) │  │ (Email)   │  │ (Logging) │  │ (BVC)        │  │
│  └──────────┘  └───────────┘  └───────────┘  └──────────────┘  │
└──────────────────────────────────────────────────────────────────┘
```

## 📁 Project Structure

```
karanscall-agent/
├── agent/                        # Python LiveKit Agent (Railway)
│   ├── agent.py                 # Main agent — tools, prompts, SIP logic
│   ├── hybrid_tts.py            # Hybrid TTS router (Deepgram ↔ Sarvam)
│   ├── requirements.txt         # Python dependencies
│   ├── Dockerfile               # Docker config for Railway
│   ├── railway.toml             # Railway deployment config
│   └── .env.example             # Environment template
│
├── api/                          # Vercel Serverless Functions
│   ├── token/
│   │   └── index.ts             # Token generation + agent dispatch
│   ├── sheets/
│   │   └── index.ts             # Google Sheets user logging
│   └── token.ts                 # Shared token logic
│
├── components/                   # React components
│   ├── AvatarCanvas.tsx         # Live2D PixiJS renderer + lip sync
│   ├── AvatarSelector.tsx       # Avatar selection modal
│   ├── avatarModels.ts          # Model registry (paths, thumbnails)
│   ├── AudioVisualizer.tsx      # Audio visualization bars
│   └── Transcript.tsx           # Live transcription display
│
├── hooks/                        # React hooks
│   └── useLiveKitAgent.ts       # LiveKit connection hook
│
├── public/
│   ├── models/                  # Live2D model assets
│   │   ├── huohuo/              # Huohuo avatar
│   │   ├── Model1/              # Nimshiha avatar
│   │   └── DemonGirl/           # Demon Girl avatar
│   ├── lib/                     # Live2D Cubism 4 SDK
│   ├── manifest.json            # PWA manifest
│   └── *.mp3                    # Sound effects
│
├── App.tsx                       # Main React app
├── index.html                   # HTML entry + PWA meta + animations
├── server.ts                    # Dev API server (token + sheets)
├── package.json                 # NPM dependencies (v3.0.0)
├── vite.config.ts               # Vite config
└── vercel.json                  # Vercel deployment config
```

## 🚀 Getting Started

### Prerequisites

- Node.js 18+
- Python 3.10+
- [LiveKit Cloud account](https://cloud.livekit.io)
- [Groq API key](https://console.groq.com)
- [Deepgram API key](https://console.deepgram.com)

**Optional (for full features):**
- [Tavily API key](https://tavily.com) — Web search
- [Resend API key](https://resend.com) — Email delivery
- [Notion Integration](https://developers.notion.com) — Conversation logging
- [Sarvam AI API key](https://sarvam.ai) — Hindi STT/TTS
- Google Sheets Service Account — User tracking

### 1. Clone & Install

```bash
git clone <your-repo>
cd karanscall-agent

# Install frontend dependencies
npm install

# Install agent dependencies
cd agent
pip install -r requirements.txt
cd ..
```

### 2. Configure Environment

**Frontend (.env.local):**
```bash
cp .env.example .env.local

# Required
LIVEKIT_API_KEY=your_key
LIVEKIT_API_SECRET=your_secret
LIVEKIT_URL=wss://your-project.livekit.cloud
VITE_LIVEKIT_URL=wss://your-project.livekit.cloud

# Optional — Google Sheets user logging
GOOGLE_SHEETS_SPREADSHEET_ID=your_spreadsheet_id
GOOGLE_SHEETS_CLIENT_EMAIL=your_service_account@email
GOOGLE_SHEETS_PRIVATE_KEY=your_private_key
```

**Agent (agent/.env):**
```bash
cd agent
cp .env.example .env

# Required
LIVEKIT_API_KEY=your_key
LIVEKIT_API_SECRET=your_secret
LIVEKIT_URL=wss://your-project.livekit.cloud
GROQ_API_KEY=your_groq_key
DEEPGRAM_API_KEY=your_deepgram_key

# Optional
TAVILY_API_KEY=your_tavily_key          # Web search
RESEND_API_KEY=your_resend_key          # Email
RESEND_FROM_EMAIL=noreply@yourdomain    # Email sender
NOTION_TOKEN=your_notion_token          # Conversation logging
NOTION_DATABASE_ID=your_db_id           # Notion database
SARVAM_API_KEY=your_sarvam_key          # Hindi STT/TTS
PHONE_AGENT_INSTRUCTIONS="..."          # Custom SIP persona
APP_PUBLIC_URL=https://your-app.vercel.app
```

### 3. Run Locally

**Terminal 1 — API Server:**
```bash
npm run dev:server
```

**Terminal 2 — Frontend:**
```bash
npm run dev
```

**Terminal 3 — Agent:**
```bash
cd agent
python agent.py dev
```

Open http://localhost:3000 in your browser.

## 🌐 Deployment

### Frontend → Vercel

1. Push to GitHub
2. Import project in Vercel
3. Set environment variables (see above)
4. Deploy!

### Agent → Railway

1. Push the `agent/` directory to a separate repo (or use Railway's subdirectory feature)
2. Create new Railway project
3. Set all agent environment variables
4. Health check endpoint runs on `PORT` (default 8080)
5. Deploy!

## ⚙️ Configuration

### Agent Persona

Click the **Settings (⚙️)** icon in the UI to customize:

- **Agent Persona** — Define the AI's personality, role, and behavior
- **Business Details** — Add context about your business, products, or services

Settings are saved to localStorage and sent to the agent on each new call.

### Phone Agent Persona

For SIP calls, set the `PHONE_AGENT_INSTRUCTIONS` environment variable or edit line ~287 in `agent/agent.py`. This persona is used exclusively for inbound phone calls.

### Avatar Selection

Click the **Avatar (👤)** icon to select from available Live2D models. Your selection persists across sessions via localStorage.

## 🔧 Environment Variables

### Frontend

| Variable | Required | Description |
|----------|----------|-------------|
| `LIVEKIT_API_KEY` | ✅ | LiveKit Cloud API key |
| `LIVEKIT_API_SECRET` | ✅ | LiveKit Cloud API secret |
| `LIVEKIT_URL` | ✅ | LiveKit server URL (wss://...) |
| `VITE_LIVEKIT_URL` | ✅ | Same URL for client-side |
| `GOOGLE_SHEETS_SPREADSHEET_ID` | ❌ | Google Sheets ID for user logging |
| `GOOGLE_SHEETS_CLIENT_EMAIL` | ❌ | Service account email |
| `GOOGLE_SHEETS_PRIVATE_KEY` | ❌ | Service account private key |

### Agent

| Variable | Required | Description |
|----------|----------|-------------|
| `LIVEKIT_API_KEY` | ✅ | LiveKit Cloud API key |
| `LIVEKIT_API_SECRET` | ✅ | LiveKit Cloud API secret |
| `LIVEKIT_URL` | ✅ | LiveKit server URL |
| `GROQ_API_KEY` | ✅ | Groq API key for LLM |
| `DEEPGRAM_API_KEY` | ✅ | Deepgram API key for STT/TTS |
| `TAVILY_API_KEY` | ❌ | Tavily API key for web search |
| `RESEND_API_KEY` | ❌ | Resend API key for email |
| `RESEND_FROM_EMAIL` | ❌ | Sender email for Resend |
| `NOTION_TOKEN` | ❌ | Notion integration token |
| `NOTION_DATABASE_ID` | ❌ | Notion database for logs |
| `SARVAM_API_KEY` | ❌ | Sarvam AI key for Hindi |
| `PHONE_AGENT_INSTRUCTIONS` | ❌ | Custom SIP phone persona |
| `APP_PUBLIC_URL` | ❌ | Your Vercel app URL (for email branding) |

## 📝 License

MIT

## 🙏 Credits

Built with:
- [LiveKit](https://livekit.io) — Real-time audio/video infrastructure + SIP
- [Groq](https://groq.com) — Fast LLM inference
- [Deepgram](https://deepgram.com) — Speech AI (STT + TTS)
- [Sarvam AI](https://sarvam.ai) — Indian language voice AI
- [Tavily](https://tavily.com) — AI-optimized web search
- [Resend](https://resend.com) — Developer email API
- [Notion](https://developers.notion.com) — Conversation logging
- [PixiJS](https://pixijs.com) + [pixi-live2d-display](https://github.com/guansss/pixi-live2d-display) — Live2D avatar rendering
- [React](https://react.dev) — UI framework
- [Vite](https://vitejs.dev) — Build tool
- [TailwindCSS](https://tailwindcss.com) — Styling
