# Vocalize AI - LiveKit Voice Agent

A real-time voice AI agent built with LiveKit, powered by Groq LLM and Deepgram for speech processing.

## Features

- 🎙️ **Real-time Voice Conversation** - Natural back-and-forth dialogue
- 🧠 **Groq LLM** - Fast inference with Llama 3.3 70B
- 🗣️ **Deepgram STT/TTS** - High-quality speech recognition and synthesis
- 🔇 **Noise Cancellation** - Built-in AEC for clean audio
- 🎯 **Voice Activity Detection** - Silero VAD for accurate speech detection
- 📝 **Live Transcription** - Real-time transcripts sent to frontend
- ⚡ **Turn Detection** - Natural conversation flow with interruption support

## Prerequisites

- Python 3.10+
- LiveKit Cloud account ([cloud.livekit.io](https://cloud.livekit.io))
- Groq API key ([console.groq.com](https://console.groq.com))
- Deepgram API key ([console.deepgram.com](https://console.deepgram.com))

## Setup

1. **Clone and navigate to agent directory:**
   ```bash
   cd agent
   ```

2. **Create virtual environment:**
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

3. **Install dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

4. **Configure environment:**
   ```bash
   cp .env.example .env
   # Edit .env with your API keys
   ```

5. **Download model files:**
   ```bash
   python agent.py download-files
   ```

## Running Locally

### Development Mode
```bash
python agent.py dev
```
This connects to LiveKit Cloud and waits for rooms to join.

### Console Mode (Terminal Testing)
```bash
python agent.py console
```
Test the agent directly in your terminal.

## Deployment to Railway

1. **Push to GitHub** (the agent directory)

2. **Create Railway project:**
   - Connect your GitHub repo
   - Railway will auto-detect the Dockerfile

3. **Set environment variables in Railway:**
   - `LIVEKIT_API_KEY`
   - `LIVEKIT_API_SECRET`
   - `LIVEKIT_URL`
   - `GROQ_API_KEY`
   - `DEEPGRAM_API_KEY`

4. **Deploy!**

## Configuration

The agent receives configuration from the frontend via participant metadata:

```json
{
  "userName": "John",
  "persona": "You are a helpful sales assistant...",
  "businessDetails": "Our company sells..."
}
```

## Architecture

```
Frontend (Vercel)
     │
     ▼
LiveKit Cloud ◄──► Voice Agent (Railway)
     │                    │
     │                    ├── Groq LLM
     │                    ├── Deepgram STT
     │                    └── Deepgram TTS
     │
     ▼
Real-time Audio + Transcriptions
```

## License

MIT
