# Vocalize AI - Voice Call Agent

A real-time AI voice call agent built with **LiveKit Cloud**, **Groq LLM**, and **Deepgram** for speech processing. This application provides a seamless voice conversation experience with an intelligent AI agent.

![Vocalize AI](https://img.shields.io/badge/Vocalize-AI-rose?style=for-the-badge)
![LiveKit](https://img.shields.io/badge/LiveKit-Cloud-blue?style=for-the-badge)
![Groq](https://img.shields.io/badge/Groq-LLM-green?style=for-the-badge)

## ✨ Features

- 🎙️ **Real-time Voice Conversation** - Natural back-and-forth dialogue
- 🧠 **Groq LLM** - Fast inference with Llama 3.3 70B
- 🗣️ **Deepgram STT/TTS** - High-quality speech recognition and synthesis
- 🔇 **Noise Cancellation** - Built-in AEC for clean audio
- 🎯 **Voice Activity Detection** - Silero VAD for accurate speech detection
- 📝 **Live Transcription** - Real-time transcripts displayed in UI
- ⚡ **Turn Detection** - Natural conversation flow with interruption support
- 🔐 **Unique Rooms** - Each user gets their own private room
- ⚙️ **Customizable Agent** - Configure persona and business context

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Frontend (Vercel)                     │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐     │
│  │   React UI  │───▶│ LiveKit SDK │───▶│ /api/token  │     │
│  └─────────────┘    └─────────────┘    └─────────────┘     │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      LiveKit Cloud                           │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  WebRTC Media Server (Audio, Transcriptions)         │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   Backend Agent (Railway)                    │
│  ┌───────────┐  ┌───────────┐  ┌───────────┐               │
│  │ Groq LLM  │  │ Deepgram  │  │ Silero    │               │
│  │           │  │ STT/TTS   │  │ VAD       │               │
│  └───────────┘  └───────────┘  └───────────┘               │
└─────────────────────────────────────────────────────────────┘
```

## 📁 Project Structure

```
karanscall-agent/
├── agent/                    # Python LiveKit Agent (Railway)
│   ├── agent.py             # Main agent code
│   ├── requirements.txt     # Python dependencies
│   ├── Dockerfile           # Docker config for Railway
│   ├── railway.toml         # Railway deployment config
│   └── .env.example         # Environment template
│
├── api/                      # Vercel Serverless Functions
│   └── token/
│       └── index.ts         # Token generation endpoint
│
├── components/               # React components
│   ├── AudioVisualizer.tsx  # Audio visualization bars
│   └── Transcript.tsx       # Live transcription display
│
├── hooks/                    # React hooks
│   └── useLiveKitAgent.ts   # LiveKit connection hook
│
├── App.tsx                   # Main React app
├── index.html               # HTML entry point
├── package.json             # NPM dependencies
├── vite.config.ts           # Vite configuration
├── vercel.json              # Vercel deployment config
└── server.ts                # Development API server
```

## 🚀 Getting Started

### Prerequisites

- Node.js 18+
- Python 3.10+
- [LiveKit Cloud account](https://cloud.livekit.io)
- [Groq API key](https://console.groq.com)
- [Deepgram API key](https://console.deepgram.com)

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
# Edit .env.local with your LiveKit credentials
```

**Agent (agent/.env):**
```bash
cd agent
cp .env.example .env
# Edit .env with all your API keys
```

### 3. Run Locally

**Terminal 1 - API Server:**
```bash
npm run dev:server
```

**Terminal 2 - Frontend:**
```bash
npm run dev
```

**Terminal 3 - Agent:**
```bash
cd agent
python agent.py dev
```

Open http://localhost:3000 in your browser.

## 🌐 Deployment

### Frontend → Vercel

1. Push to GitHub
2. Import project in Vercel
3. Set environment variables:
   - `LIVEKIT_API_KEY`
   - `LIVEKIT_API_SECRET`
   - `LIVEKIT_URL`
4. Deploy!

### Agent → Railway

1. Push the `agent/` directory to a separate repo (or use Railway's subdirectory feature)
2. Create new Railway project
3. Set environment variables:
   - `LIVEKIT_API_KEY`
   - `LIVEKIT_API_SECRET`
   - `LIVEKIT_URL`
   - `GROQ_API_KEY`
   - `DEEPGRAM_API_KEY`
4. Deploy!

## ⚙️ Configuration

### Agent Persona

In the UI, click the Settings (⚙️) icon to customize:

- **Agent Persona**: Define the AI's personality, role, and behavior
- **Business Details**: Add context about your business, products, or services

Settings are saved to localStorage and sent to the agent on each new call.

### Unique Rooms

Each "Start Call" creates a unique room name (UUID), ensuring:
- Users never connect to each other's rooms
- Complete privacy for each conversation
- Multiple simultaneous users supported

## 🔧 Environment Variables

### Frontend

| Variable | Description |
|----------|-------------|
| `LIVEKIT_API_KEY` | LiveKit Cloud API key |
| `LIVEKIT_API_SECRET` | LiveKit Cloud API secret |
| `LIVEKIT_URL` | LiveKit server URL (wss://...) |
| `VITE_LIVEKIT_URL` | Same URL for client-side |

### Agent

| Variable | Description |
|----------|-------------|
| `LIVEKIT_API_KEY` | LiveKit Cloud API key |
| `LIVEKIT_API_SECRET` | LiveKit Cloud API secret |
| `LIVEKIT_URL` | LiveKit server URL |
| `GROQ_API_KEY` | Groq API key for LLM |
| `DEEPGRAM_API_KEY` | Deepgram API key for STT/TTS |

## 📝 License

MIT

## 🙏 Credits

Built with:
- [LiveKit](https://livekit.io) - Real-time audio infrastructure
- [Groq](https://groq.com) - Fast LLM inference
- [Deepgram](https://deepgram.com) - Speech AI
- [React](https://react.dev) - UI framework
- [Vite](https://vitejs.dev) - Build tool
