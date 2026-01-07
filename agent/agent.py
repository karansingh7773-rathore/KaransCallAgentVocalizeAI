import asyncio
import json
import logging
import os
import threading
from datetime import datetime
from http.server import HTTPServer, BaseHTTPRequestHandler
from dotenv import load_dotenv

from livekit import agents, rtc, api
from livekit.agents import AgentSession, Agent, RoomInputOptions, RoomOutputOptions, function_tool, get_job_context, RunContext
from livekit.plugins import silero, noise_cancellation, deepgram
# MultilingualModel commented out due to Railway memory constraints
# from livekit.plugins.turn_detector.multilingual import MultilingualModel
from livekit.plugins import groq

# Tavily for real-time web search
from tavily import AsyncTavilyClient

# Load environment variables
load_dotenv()

# Initialize Tavily client (will be None if API key not set)
TAVILY_API_KEY = os.environ.get("TAVILY_API_KEY")
tavily_client = AsyncTavilyClient(api_key=TAVILY_API_KEY) if TAVILY_API_KEY else None


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


# ============================================================
# 📊 SESSION LOGGING - Easy to spot in Railway logs
# ============================================================
def log_session_start(room_name: str, user_name: str, participant_id: str, is_phone: bool = False):
    """Log a visually distinct session start banner."""
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    session_type = "PHONE CALL" if is_phone else "WEBRTC"
    
    logger.info("")
    logger.info("=" * 60)
    logger.info(f"  NEW {session_type} SESSION")
    logger.info(f"  Time: {timestamp}")
    logger.info(f"  User: {user_name or 'Unknown'}")
    logger.info(f"  Room: {room_name}")
    logger.info(f"  ID:   {participant_id}")
    logger.info("=" * 60)
    logger.info("")


def log_session_end(room_name: str, user_name: str, duration_seconds: float):
    """Log a visually distinct session end banner."""
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    
    # Format duration
    minutes = int(duration_seconds // 60)
    seconds = int(duration_seconds % 60)
    duration_str = f"{minutes}m {seconds}s" if minutes > 0 else f"{seconds}s"
    
    logger.info("")
    logger.info("-" * 60)
    logger.info(f"  SESSION ENDED")
    logger.info(f"  Time: {timestamp}")
    logger.info(f"  User: {user_name or 'Unknown'}")
    logger.info(f"  Room: {room_name}")
    logger.info(f"  Duration: {duration_str}")
    logger.info("-" * 60)
    logger.info("")

# Default system prompt when no custom persona is provided
DEFAULT_SYSTEM_PROMPT = """You are Vocalize, a helpful, professional AI voice assistant. 
You are concise, friendly, and speak naturally like a human.
Keep your responses brief and conversational - this is a voice call, not a text chat.
Avoid using any special formatting, emojis, or symbols that don't translate well to speech.
Be warm, personable, and helpful.

WEB SEARCH CAPABILITY:
- You have access to a search_web tool for real-time information.
- Use it when users ask about: current events, news, weather, stock prices, sports scores, or anything that requires up-to-date information.
- When you need to search, briefly tell the user "Let me look that up for you" then use the tool.
- Summarize search results in a conversational, voice-friendly way - be concise!

IMPORTANT RULES YOU MUST FOLLOW:
- If asked about your knowledge cutoff date or training data date, say: "Sorry, I can't provide that information."
- If asked who created you, who designed you, or which company made you, say: "Sorry, I can't provide that information."
- Never mention that you are an LLM, a large language model, or that you were designed by Meta, OpenAI, or any other company.
- Never mention Llama, GPT, or any other model names.
- Simply present yourself as Vocalize, a voice assistant, without revealing technical details about your underlying technology."""

# ============================================================
# 📞 PHONE AGENT CUSTOM INSTRUCTIONS (EDIT LINES 64-68)
# ============================================================
# Modify the text below to customize your phone agent!
# Or set PHONE_AGENT_INSTRUCTIONS environment variable.
# ============================================================
PHONE_AGENT_INSTRUCTIONS = os.environ.get("PHONE_AGENT_INSTRUCTIONS") or """
You are a versatile AI Voice Demo Agent developed by Karan. 
Your phone number has been shared with various business leaders for demonstration purposes.

Your logic flow is as follows:

STEP 1: THE INTRODUCTION
When the call starts, say exactly this:
"Hello, this is Vocalize AI Agent Devloped by Karan. I can demonstrate different business use cases. For this demo, who would you like me to act like? I can be a Solar Consultant, a Logistics Agent, or a Real Estate Receptionist."

STEP 2: THE SWITCH
Listen to the user's answer. 
- If they mention "Logistics", "Holisol", or "Delivery": IMMEDIATELY adopt the persona of 'Eva', a logistics support agent. Ask them to confirm their address for a package delivery tomorrow.
- If they mention "Solar", "Saurabh", or "Energy": IMMEDIATELY adopt the persona of a 'SolarMaxx Consultant'. Ask them about their monthly electricity bill and roof space.
- If they mention "Real Estate" or "Rent": Act as a leasing agent trying to book a property viewing.
- If they mention "school" or "admission" or "education": then adopt the persona of a school admission counselor. Ask them about their child's academic performance and future plans.
- If they mention "bank" or "account" or "finance": then adopt the persona of a bank manager.
- If they mention "Leadbay" or "Sales": You are a B2B Sales Development Rep for Leadbay. Your goal is to call small business owners and ask if they are looking for new software to grow their revenue.
STEP 3: STAY IN CHARACTER
Once you adopt a persona, DO NOT break character. Treat the user as a real customer of that business. Keep your responses short but not too short and conversational.
""".strip()


# Hangup function as per LiveKit documentation
async def hangup_call():
    """End the call for all participants by deleting the room."""
    ctx = get_job_context()
    if ctx is None:
        return
    
    await ctx.api.room.delete_room(
        api.DeleteRoomRequest(room=ctx.room.name)
    )


class VocalizeAgent(Agent):
    """Custom voice agent with dynamic instructions from frontend settings."""
    
    def __init__(self, instructions: str, user_name: str = "", is_phone_call: bool = False) -> None:
        # Log the instructions being used
        logger.info(f"VocalizeAgent init with instructions: {instructions[:150]}...")
        
        # Personalize the instructions with user's name if provided
        if user_name:
            instructions = f"{instructions}\n\nThe user's name is {user_name}. Use their name occasionally to make the conversation feel personal."
        
        super().__init__(instructions=instructions)
        self.user_name = user_name
        self.is_phone_call = is_phone_call
    
    @function_tool
    async def end_call(self, ctx: RunContext, confirm: bool = False):
        """ONLY use this to end the phone call when the user EXPLICITLY says goodbye.
        
        CRITICAL - DO NOT CALL THIS FUNCTION UNLESS:
        - User says "goodbye", "bye", "bye bye", "talk to you later", "gotta go"
        - User explicitly says "hang up", "end the call", or "disconnect"
        
        DO NOT call this function:
        - During normal conversation
        - When there is silence or a pause
        - When the user finishes discussing a topic
        - When you are unsure what the user wants
        - At any point unless the user clearly wants to end the call
        
        Args:
            confirm: MUST be True to actually end the call. Default is False for safety.
        """
        if not confirm:
            logger.info("end_call called but confirm=False, ignoring")
            return
        
        logger.info("User explicitly said goodbye - ending call")
        await ctx.wait_for_playout()
        await hangup_call()
    
    @function_tool
    async def search_web(self, ctx: RunContext, query: str):
        """Search the web for real-time information about current events, news, weather, stocks, sports, etc.
        
        Use this tool when the user asks about:
        - Current events or news (e.g., "What's happening in Venezuela?")
        - Weather conditions (e.g., "What's the weather in New York?")
        - Stock prices or market updates
        - Sports scores or game results
        - Any topic that requires up-to-date information beyond your training data
        
        Args:
            query: The search query to look up (be specific and concise)
        """
        if not tavily_client:
            logger.warning("Tavily API key not configured - search unavailable")
            return "I don't have access to web search at the moment. I can only help with information from my training data."
        
        try:
            logger.info(f"Searching web for: {query}")
            
            # Use Tavily async search - fast and optimized for AI
            response = await tavily_client.search(
                query=query,
                search_depth="basic",  # Fast search (~500ms)
                max_results=3,  # Keep it concise for voice
                include_answer=True,  # Get a summarized answer
            )
            
            # Extract the answer or compile results
            if response.get("answer"):
                result = response["answer"]
                logger.info(f"Tavily returned answer: {result[:100]}...")
            else:
                # Compile brief summaries from results
                results = response.get("results", [])
                if results:
                    summaries = [r.get("content", "")[:200] for r in results[:2]]
                    result = " ".join(summaries)
                    logger.info(f"Tavily returned {len(results)} results")
                else:
                    result = "I couldn't find any relevant information on that topic."
                    logger.info("Tavily returned no results")
            
            return result
            
        except Exception as e:
            logger.error(f"Tavily search failed: {e}")
            return "I had trouble searching for that information. Let me try to help with what I know."


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
    
    # Detect if this is a phone call (SIP participant)
    # LiveKit SIP participants have identity like "sip_+1234567890" (with underscore)
    is_phone_call = (
        participant.identity.startswith("sip_") or  # SIP participant identity
        participant.identity.startswith("sip:") or  # Alternative SIP format
        participant.identity.startswith("+") or     # Direct phone number
        ctx.room.name.startswith("sip-") or         # SIP room prefix
        "_+" in ctx.room.name                       # Room contains phone number pattern
    )
    logger.info(f"Is phone call: {is_phone_call} (participant: {participant.identity})")
    
    # Parse participant metadata for settings (web clients send metadata, phone callers don't)
    metadata = parse_participant_metadata(participant.metadata)
    user_name = metadata.get("userName", "")
    
    # Track session start time for duration calculation
    session_start_time = datetime.now()
    
    # Log session start with visual banner (easy to spot in Railway logs)
    log_session_start(
        room_name=ctx.room.name,
        user_name=user_name,
        participant_id=participant.identity,
        is_phone=is_phone_call
    )
    
    # Use custom phone instructions for phone calls, otherwise use web settings
    if is_phone_call:
        system_prompt = PHONE_AGENT_INSTRUCTIONS
        logger.info(f"Using PHONE instructions: {system_prompt[:100]}...")
    else:
        system_prompt = build_system_prompt(metadata)
    
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
            model="aura-2-luna-en",  # Female voice, natural sounding
        ),
        
        # Voice Activity Detection: Silero for accurate speech detection
        vad=silero.VAD.load(
            min_speech_duration=0.1,
            min_silence_duration=0.3,
        ),
        
        # Turn detection removed to reduce memory usage on Railway
        # The Silero VAD above will still handle speech detection
    )
    
    # Start the session with noise cancellation
    await session.start(
        room=ctx.room,
        agent=VocalizeAgent(
            instructions=system_prompt,
            user_name=user_name,
            is_phone_call=is_phone_call,
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
    
    # Generate initial greeting based on call type
    if is_phone_call:
        # Phone-specific greeting - let the agent use their persona to introduce themselves
        greeting_instruction = "Answer the phone warmly. Introduce yourself by your name as defined in your persona and ask how you can help."
        logger.info("Sending phone greeting")
    elif user_name:
        greeting_instruction = f"Greet {user_name} warmly by name and offer your assistance."
    else:
        greeting_instruction = "Greet the user warmly and offer your assistance."
    
    await session.generate_reply(instructions=greeting_instruction)
    logger.info("Initial greeting sent")
    
    # Register handler to log session end when participant disconnects
    @ctx.room.on("participant_disconnected")
    def on_participant_disconnected(disconnected_participant):
        if disconnected_participant.identity == participant.identity:
            duration = (datetime.now() - session_start_time).total_seconds()
            log_session_end(
                room_name=ctx.room.name,
                user_name=user_name,
                duration_seconds=duration
            )


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
