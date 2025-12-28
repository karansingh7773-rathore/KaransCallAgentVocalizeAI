import asyncio
import json
import logging
import os
import threading
from http.server import HTTPServer, BaseHTTPRequestHandler
from dotenv import load_dotenv

from livekit import agents, rtc
from livekit.agents import AgentSession, Agent, RoomInputOptions, RoomOutputOptions
from livekit.plugins import silero, noise_cancellation, deepgram
from livekit.plugins.turn_detector.multilingual import MultilingualModel
from livekit.plugins import groq

# Load environment variables
load_dotenv()


class HealthCheckHandler(BaseHTTPRequestHandler):
    """Simple HTTP handler for Railway health checks."""
    
    def do_GET(self):
        self.send_response(200)
        self.send_header('Content-type', 'text/plain')
        self.end_headers()
        self.wfile.write(b'OK')
    
    def log_message(self, format, *args):
        # Suppress health check logs to reduce noise
        pass


def start_health_server():
    """Start a simple HTTP server for health checks in a background thread."""
    port = int(os.environ.get('PORT', 8080))
    server = HTTPServer(('0.0.0.0', port), HealthCheckHandler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    logging.getLogger("vocalize-agent").info(f"Health check server running on port {port}")

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("vocalize-agent")

# Default system prompt when no custom persona is provided
DEFAULT_SYSTEM_PROMPT = """You are Vocalize, a helpful, professional AI voice assistant. 
You are concise, friendly, and speak naturally like a human.
Keep your responses brief and conversational - this is a voice call, not a text chat.
Avoid using any special formatting, emojis, or symbols that don't translate well to speech.
Be warm, personable, and helpful."""


class VocalizeAgent(Agent):
    """Custom voice agent with dynamic instructions from frontend settings."""
    
    def __init__(self, instructions: str, user_name: str = "") -> None:
        # Personalize the instructions with user's name if provided
        if user_name:
            instructions = f"{instructions}\n\nThe user's name is {user_name}. Use their name occasionally to make the conversation feel personal."
        
        super().__init__(instructions=instructions)
        self.user_name = user_name


def parse_participant_metadata(metadata: str) -> dict:
    """Parse JSON metadata from participant to extract settings."""
    if not metadata:
        return {}
    
    try:
        return json.loads(metadata)
    except json.JSONDecodeError:
        logger.warning(f"Failed to parse participant metadata: {metadata}")
        return {}


def build_system_prompt(metadata: dict) -> str:
    """Build the system prompt from participant metadata."""
    persona = metadata.get("persona", "").strip()
    business_details = metadata.get("businessDetails", "").strip()
    
    # If no custom settings, use default
    if not persona and not business_details:
        return DEFAULT_SYSTEM_PROMPT
    
    # Build custom prompt from settings
    prompt_parts = []
    
    if persona:
        prompt_parts.append(persona)
    else:
        prompt_parts.append(DEFAULT_SYSTEM_PROMPT)
    
    if business_details:
        prompt_parts.append(f"\n\nContext & Business Details:\n{business_details}")
    
    # Add voice-specific guidance
    prompt_parts.append("""

Remember: This is a voice conversation. Keep responses concise and natural.
Avoid special characters, emojis, or formatting that doesn't translate to speech.""")
    
    return "".join(prompt_parts)


async def entrypoint(ctx: agents.JobContext):
    """Main entrypoint for the LiveKit voice agent."""
    logger.info(f"Agent entrypoint started for room: {ctx.room.name}")
    
    # Connect to the room
    await ctx.connect()
    logger.info("Connected to room")
    
    # Wait for a participant to join
    participant = await ctx.wait_for_participant()
    logger.info(f"Participant joined: {participant.identity}")
    
    # Parse participant metadata for settings
    metadata = parse_participant_metadata(participant.metadata)
    user_name = metadata.get("userName", "")
    system_prompt = build_system_prompt(metadata)
    
    logger.info(f"User name: {user_name}")
    logger.info(f"System prompt length: {len(system_prompt)} chars")
    
    # Create the agent session with all plugins
    session = AgentSession(
        # Speech-to-Text: Deepgram for accurate transcription
        stt=deepgram.STT(
            model="nova-2",
            language="en",
        ),
        
        # LLM: Groq for fast inference
        llm=groq.LLM(
            model="llama-3.3-70b-versatile",
            temperature=0.7,
        ),
        
        # Text-to-Speech: Deepgram for natural voice
        tts=deepgram.TTS(
            model="aura-asteria-en",  # Female voice, natural sounding
        ),
        
        # Voice Activity Detection: Silero for accurate speech detection
        vad=silero.VAD.load(
            min_speech_duration=0.1,
            min_silence_duration=0.3,
        ),
        
        # Turn detection for natural conversation flow
        turn_detection=MultilingualModel(),
    )
    
    # Start the session with noise cancellation
    await session.start(
        room=ctx.room,
        agent=VocalizeAgent(
            instructions=system_prompt,
            user_name=user_name,
        ),
        room_input_options=RoomInputOptions(
            # Enable noise cancellation for cleaner audio
            noise_cancellation=noise_cancellation.BVC(),
        ),
        room_output_options=RoomOutputOptions(
            # Enable transcription forwarding to frontend
            transcription_enabled=True,
        ),
    )
    
    logger.info("Agent session started")
    
    # Generate initial greeting
    greeting_instruction = "Greet the user warmly and offer your assistance."
    if user_name:
        greeting_instruction = f"Greet {user_name} warmly by name and offer your assistance."
    
    await session.generate_reply(instructions=greeting_instruction)
    logger.info("Initial greeting sent")


if __name__ == "__main__":
    # Start health check server for Railway
    start_health_server()
    
    # Run the agent with CLI support
    agents.cli.run_app(
        agents.WorkerOptions(
            entrypoint_fnc=entrypoint,
            # Agent will be dispatched to rooms automatically
        )
    )
