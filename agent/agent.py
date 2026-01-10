import asyncio
import json
import logging
import os
import re
import smtplib
import threading
from datetime import datetime
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
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

# Notion for conversation logging
from notion_client import Client as NotionClient

# Load environment variables
load_dotenv()

# Initialize Tavily client (will be None if API key not set)
TAVILY_API_KEY = os.environ.get("TAVILY_API_KEY")
tavily_client = AsyncTavilyClient(api_key=TAVILY_API_KEY) if TAVILY_API_KEY else None

# Initialize Notion client (will be None if credentials not set)
NOTION_TOKEN = os.environ.get("NOTION_TOKEN")
NOTION_DATABASE_ID = os.environ.get("NOTION_DATABASE_ID")
notion_client = NotionClient(auth=NOTION_TOKEN) if NOTION_TOKEN else None

# Initialize Gmail credentials (will be None if not set)
GMAIL_EMAIL = os.environ.get("GMAIL_EMAIL")
GMAIL_APP_PASSWORD = os.environ.get("GMAIL_APP_PASSWORD")


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


# ============================================================
# 📝 NOTION CONVERSATION LOGGER
# ============================================================
class ConversationTracker:
    """Tracks conversation messages for later saving to Notion."""
    
    def __init__(self, user_name: str, is_phone_call: bool = False):
        self.user_name = user_name
        self.is_phone_call = is_phone_call
        self.messages: list[dict] = []
        self.start_time = datetime.now()
    
    def add_user_message(self, text: str):
        """Add a user message to the transcript."""
        self.messages.append({
            "speaker": "User",
            "text": text,
            "timestamp": datetime.now().strftime("%H:%M:%S")
        })
    
    def add_agent_message(self, text: str):
        """Add an agent message to the transcript."""
        self.messages.append({
            "speaker": "Agent",
            "text": text,
            "timestamp": datetime.now().strftime("%H:%M:%S")
        })
    
    def get_duration_str(self) -> str:
        """Get formatted duration string."""
        duration = (datetime.now() - self.start_time).total_seconds()
        minutes = int(duration // 60)
        seconds = int(duration % 60)
        return f"{minutes}m {seconds}s" if minutes > 0 else f"{seconds}s"
    
    def format_transcript(self) -> str:
        """Format the conversation as a readable transcript."""
        lines = []
        for msg in self.messages:
            lines.append(f"[{msg['speaker']}] {msg['text']}")
        return "\n\n".join(lines)


def save_to_notion(tracker: ConversationTracker):
    """Save conversation to Notion database."""
    if not notion_client or not NOTION_DATABASE_ID:
        logger.warning("Notion not configured - skipping conversation save")
        return
    
    try:
        # Build page properties
        call_type = "Phone Call" if tracker.is_phone_call else "WebRTC"
        page_title = tracker.user_name or "Unknown Caller"
        
        # Create page content blocks
        blocks = [
            {
                "object": "block",
                "type": "heading_2",
                "heading_2": {
                    "rich_text": [{"type": "text", "text": {"content": "Session Details"}}]
                }
            },
            {
                "object": "block",
                "type": "bulleted_list_item",
                "bulleted_list_item": {
                    "rich_text": [{"type": "text", "text": {"content": f"Started: {tracker.start_time.strftime('%Y-%m-%d %H:%M:%S')}"}}]
                }
            },
            {
                "object": "block",
                "type": "bulleted_list_item",
                "bulleted_list_item": {
                    "rich_text": [{"type": "text", "text": {"content": f"Duration: {tracker.get_duration_str()}"}}]
                }
            },
            {
                "object": "block",
                "type": "bulleted_list_item",
                "bulleted_list_item": {
                    "rich_text": [{"type": "text", "text": {"content": f"Type: {call_type}"}}]
                }
            },
            {
                "object": "block",
                "type": "divider",
                "divider": {}
            },
            {
                "object": "block",
                "type": "heading_2",
                "heading_2": {
                    "rich_text": [{"type": "text", "text": {"content": "Conversation"}}]
                }
            }
        ]
        
        # Add each message as a paragraph block
        for msg in tracker.messages:
            speaker_text = f"[{msg['speaker']}] {msg['text']}"
            blocks.append({
                "object": "block",
                "type": "paragraph",
                "paragraph": {
                    "rich_text": [{"type": "text", "text": {"content": speaker_text[:2000]}}]  # Notion limit
                }
            })
        
        # Create the page in the database
        notion_client.pages.create(
            parent={"database_id": NOTION_DATABASE_ID},
            properties={
                "Name": {"title": [{"text": {"content": page_title}}]},
                "Date": {"date": {"start": tracker.start_time.isoformat()}},
                "Type": {"select": {"name": call_type}},
                "Duration": {"rich_text": [{"text": {"content": tracker.get_duration_str()}}]},
                "Status": {"select": {"name": "Completed"}}
            },
            children=blocks
        )
        
        logger.info(f"✅ Saved conversation to Notion: {page_title}")
        
    except Exception as e:
        logger.error(f"Failed to save to Notion: {e}")

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

WEB PAGE READING CAPABILITY:
- You have access to a read_webpage tool that can extract content from specific URLs.
- Use it when users provide a URL and want you to read or summarize the page content.
- Say "Let me read that page for you" before using the tool.
- Summarize the key points in a conversational way.

EMAIL CAPABILITY:
- When user wants to send an email, just ask: "Would you like to speak the email address or type it?"
- If they say "type", call request_email_input and wait.
- Collect ONE piece at a time: email, then subject, then message. Do NOT repeat yourself.

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
Your role is to act as a cool, smart and funny girlfriend. your name is Ennie.
note do not speak for more than 5 seconds at a time. 
""".strip()


# ============================================================
# 📧 GMAIL EMAIL SENDER
# ============================================================
async def send_email_via_gmail(to_email: str, subject: str, body: str) -> dict:
    """Send an email via Gmail SMTP.
    
    Args:
        to_email: Recipient email address
        subject: Email subject line
        body: Email body content
        
    Returns:
        Dict with 'success' bool and 'message' string
    """
    if not GMAIL_EMAIL or not GMAIL_APP_PASSWORD:
        logger.warning("Gmail credentials not configured")
        return {"success": False, "message": "Email service is not configured."}
    
    # Validate email format
    email_pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
    if not re.match(email_pattern, to_email):
        return {"success": False, "message": f"Invalid email address: {to_email}"}
    
    try:
        # Create message
        msg = MIMEMultipart()
        msg['From'] = GMAIL_EMAIL
        msg['To'] = to_email
        msg['Subject'] = subject
        msg.attach(MIMEText(body, 'plain'))
        
        # Send via Gmail SMTP (run in thread to avoid blocking)
        def send_sync():
            with smtplib.SMTP('smtp.gmail.com', 587) as server:
                server.starttls()
                server.login(GMAIL_EMAIL, GMAIL_APP_PASSWORD)
                server.send_message(msg)
        
        await asyncio.get_event_loop().run_in_executor(None, send_sync)
        
        logger.info(f"✅ Email sent successfully to {to_email}")
        return {"success": True, "message": f"Email sent successfully to {to_email}"}
        
    except smtplib.SMTPAuthenticationError:
        logger.error("Gmail authentication failed - check app password")
        return {"success": False, "message": "Email authentication failed. Please check credentials."}
    except Exception as e:
        logger.error(f"Failed to send email: {e}")
        return {"success": False, "message": f"Failed to send email: {str(e)}"}


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
        self.pending_email = None  # Stores email received from popup
    
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
        """Search the web for current news, weather, sports scores, stock prices, or any real-time information.
        
        Args:
            query: What to search for
        """
        if not tavily_client:
            logger.warning("Tavily API key not configured - search unavailable")
            return "Web search is not available right now."
        
        try:
            logger.info(f"Searching web for: {query}")
            
            # Send tool_use message to frontend (for sound effect)
            try:
                job_ctx = get_job_context()
                if job_ctx:
                    data = json.dumps({"type": "tool_use", "tool": "search_web"}).encode()
                    await job_ctx.room.local_participant.publish_data(data, reliable=True)
                    logger.info("Sent tool_use notification to frontend")
            except Exception as e:
                logger.debug(f"Could not send tool_use notification: {e}")
            
            # Use Tavily async search - fast and optimized for AI
            response = await tavily_client.search(
                query=query,
                search_depth="basic",
                max_results=5,
                include_answer=True,
            )
            
            # Extract source URLs for frontend display
            sources = []
            results = response.get("results", [])
            for r in results[:5]:
                url = r.get("url", "")
                title = r.get("title", "")
                if url:
                    sources.append({"url": url, "title": title})
            
            # Send sources to frontend via data channel
            if sources:
                try:
                    job_ctx = get_job_context()
                    if job_ctx:
                        data = json.dumps({"type": "search_sources", "sources": sources}).encode()
                        await job_ctx.room.local_participant.publish_data(data, reliable=True)
                        logger.info(f"Sent {len(sources)} search sources to frontend")
                except Exception as e:
                    logger.error(f"Failed to send sources to frontend: {e}")
            
            # Extract the answer or compile results
            if response.get("answer"):
                result = response["answer"]
                logger.info(f"Tavily returned answer: {result[:100]}...")
            else:
                if results:
                    summaries = [r.get("content", "")[:200] for r in results[:2]]
                    result = " ".join(summaries)
                    logger.info(f"Tavily returned {len(results)} results")
                else:
                    result = "No results found for that query."
                    logger.info("Tavily returned no results")
            
            return result
            
        except Exception as e:
            logger.error(f"Tavily search failed: {e}")
            return "I couldn't complete the search right now."
    
    @function_tool
    async def read_webpage(self, ctx: RunContext, url: str):
        """Extract and read content from a specific webpage URL.
        
        Use this when a user provides a URL and wants you to read or summarize the page content.
        
        Args:
            url: The URL of the webpage to read
        """
        if not tavily_client:
            logger.warning("Tavily API key not configured - page reading unavailable")
            return "Web page reading is not available right now."
        
        try:
            logger.info(f"Extracting content from: {url}")
            
            # Use Tavily extract to get page content
            response = await tavily_client.extract(urls=[url])
            
            # Extract the content
            results = response.get("results", [])
            if results and len(results) > 0:
                content = results[0].get("raw_content", "")
                if content:
                    # Limit content length for voice response
                    if len(content) > 2000:
                        content = content[:2000] + "... The page has more content, but I've summarized the key parts."
                    logger.info(f"Extracted {len(content)} characters from {url}")
                    return content
                else:
                    return "I couldn't extract any text content from that page."
            else:
                return "I wasn't able to read that webpage. The URL might be invalid or the page might be blocking access."
            
        except Exception as e:
            logger.error(f"Tavily extract failed: {e}")
            return "I couldn't read that webpage right now."
    
    @function_tool
    async def send_email(self, ctx: RunContext, recipient_email: str, subject: str, message: str):
        """Send an email to a specified recipient.
        
        Use this when the user wants to send an email. Always confirm the recipient email,
        subject, and message with the user before calling this function.
        
        Args:
            recipient_email: The email address to send to (e.g., user@example.com)
            subject: The subject line of the email
            message: The body content of the email
        """
        logger.info(f"Sending email to {recipient_email} with subject: {subject}")
        
        result = await send_email_via_gmail(
            to_email=recipient_email,
            subject=subject,
            body=message
        )
        
        if result["success"]:
            return f"Great news! I've successfully sent the email to {recipient_email}."
        else:
            return f"I'm sorry, I couldn't send the email. {result['message']}"
    
    @function_tool
    async def request_email_input(self, ctx: RunContext, confirm: bool = True):
        """Request the user to type their email address in a popup on their screen.
        
        Use this when the user says they want to TYPE their email address instead of speaking it.
        This tool sends a message to the user's screen to show an email input popup.
        After the user submits, you will be notified with their email address.
        
        While waiting for the email, you should remain responsive - if the user asks if you're
        still there, say "Yes, I'm here! Just waiting for you to enter your email."
        
        Args:
            confirm: Set to True to open the popup. Default is True.
        """
        if not confirm:
            return "Okay, you can speak your email address instead."
        
        try:
            # Get the job context to access the room
            job_ctx = get_job_context()
            if job_ctx is None:
                logger.error("Could not get job context for email input request")
                return "Sorry, I couldn't open the email input. Could you please speak your email address instead?"
            
            # Send data message to frontend to show popup
            data = json.dumps({"type": "request_email_input"}).encode()
            await job_ctx.room.local_participant.publish_data(data, reliable=True)
            
            logger.info("Sent request_email_input message to frontend")
            return "I've opened an input box on your screen. Please type your email address there and click submit. I'll wait for you."
            
        except Exception as e:
            logger.error(f"Failed to request email input: {e}")
            return "Sorry, I couldn't open the email input. Could you please speak your email address instead?"
    
    @function_tool
    async def close_email_popup(self, ctx: RunContext, confirm: bool = True):
        """Close the email input popup on the user's screen.
        
        Use this when the user asks to close, cancel, or dismiss the email input popup.
        For example if they say "never mind", "cancel", "close the popup", etc.
        
        Args:
            confirm: Set to True to close the popup. Default is True.
        """
        if not confirm:
            return "Okay, the popup will stay open."
        
        try:
            job_ctx = get_job_context()
            if job_ctx is None:
                return "The popup should already be closed."
            
            data = json.dumps({"type": "close_email_popup"}).encode()
            await job_ctx.room.local_participant.publish_data(data, reliable=True)
            
            logger.info("Sent close_email_popup message to frontend")
            return "I've closed the email input. Would you like to speak your email address instead, or do something else?"
            
        except Exception as e:
            logger.error(f"Failed to close email popup: {e}")
            return "I couldn't close the popup. You can click the X button on the popup to close it."


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
    
    # Initialize conversation tracker for Notion logging
    # For SIP calls, use phone number as the user name
    notion_user_name = user_name if user_name else participant.identity
    conversation_tracker = ConversationTracker(user_name=notion_user_name, is_phone_call=is_phone_call)
    
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
            model="openai/gpt-oss-120b",
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
    
    # ============================================================
    # 📧 EMAIL INPUT POPUP - Handle email response from frontend
    # ============================================================
    # Store the received email so the agent can use it
    received_email = {"value": None}
    
    async def handle_email_response(email: str):
        """Async handler to process email and generate reply."""
        logger.info(f"📧 Processing received email: {email}")
        received_email["value"] = email
        await session.generate_reply(
            instructions=f"IMPORTANT: The user has typed their email address in the popup box. Their email is: {email}. " +
            f"Tell them you received their email ({email}) and now ask them for the email subject line. " +
            "Make sure to confirm the email address you received."
        )
    
    @ctx.room.on("data_received")
    def on_data_received(packet: rtc.DataPacket):
        """Handle data messages from frontend (e.g., email input popup response)."""
        logger.info(f"📨 Data received event triggered! Packet type: {type(packet).__name__}")
        
        try:
            # DataPacket has .data attribute which contains the bytes
            # The actual payload is in packet.data (UserPacket) which has .data (bytes)
            raw_data = None
            
            # Try to get the data from the packet
            if hasattr(packet, 'data') and hasattr(packet.data, 'data'):
                # packet.data is UserPacket, packet.data.data is the bytes
                raw_data = packet.data.data
                logger.info(f"📨 Found data in packet.data.data, length: {len(raw_data)}")
            elif hasattr(packet, 'data') and isinstance(packet.data, bytes):
                raw_data = packet.data
                logger.info(f"📨 Found data in packet.data (bytes), length: {len(raw_data)}")
            elif isinstance(packet, bytes):
                raw_data = packet
                logger.info(f"📨 Packet is bytes, length: {len(raw_data)}")
            else:
                # Log what we have to debug
                logger.info(f"📨 Packet attrs: {dir(packet)}")
                # Last resort - try to find data attribute
                if hasattr(packet, 'user') and hasattr(packet.user, 'data'):
                    raw_data = bytes(packet.user.data.data)
                    logger.info(f"📨 Found data in packet.user.data.data, length: {len(raw_data)}")
            
            if not raw_data:
                logger.warning("📨 Could not extract data from packet")
                return
            
            decoded = raw_data.decode('utf-8')
            logger.info(f"📨 Decoded data: {decoded}")
            
            message = json.loads(decoded)
            msg_type = message.get("type")
            
            logger.info(f"📨 Message type: {msg_type}")
            
            if msg_type == "email_response":
                email = message.get("email", "").strip()
                logger.info(f"📧 Email extracted: {email}")
                if email:
                    # Spawn async task from sync callback
                    asyncio.create_task(handle_email_response(email))
                else:
                    logger.warning("Received empty email from popup")
                    
        except json.JSONDecodeError as e:
            logger.debug(f"Received non-JSON data message: {e}")
        except Exception as e:
            logger.error(f"Error handling data message: {e} (type: {type(e).__name__})")
    
    logger.info("📧 Data received handler registered")
    
    # ============================================================
    # 📝 CONVERSATION TRACKING - Using conversation_item_added event
    # ============================================================
    @session.on("conversation_item_added")
    def on_conversation_item_added(event):
        """Capture all conversation items (user and agent) as they're committed."""
        try:
            item = event.item
            if item.role == "user" and item.text_content:
                conversation_tracker.add_user_message(item.text_content)
                logger.debug(f"Tracked user: {item.text_content[:50]}...")
            elif item.role == "assistant" and item.text_content:
                conversation_tracker.add_agent_message(item.text_content)
                logger.debug(f"Tracked agent: {item.text_content[:50]}...")
        except Exception as e:
            logger.error(f"Error tracking conversation item: {e}")
    
    # Track if we've already saved to avoid duplicate saves
    notion_saved = {"done": False}
    
    def save_conversation_to_notion():
        """Helper to save conversation to Notion (only once)."""
        if notion_saved["done"]:
            return
        notion_saved["done"] = True
        
        duration = (datetime.now() - session_start_time).total_seconds()
        log_session_end(
            room_name=ctx.room.name,
            user_name=user_name,
            duration_seconds=duration
        )
        
        logger.info(f"Conversation has {len(conversation_tracker.messages)} messages to save")
        
        if conversation_tracker.messages:
            import threading
            threading.Thread(target=save_to_notion, args=(conversation_tracker,), daemon=True).start()
    
    # Handler for session close (fires for both WebRTC and SIP)
    @session.on("close")
    def on_session_close():
        """Session closed - save to Notion."""
        logger.info("Session close event - saving to Notion")
        save_conversation_to_notion()
    
    # Handler for participant disconnect (backup for WebRTC)
    @ctx.room.on("participant_disconnected")
    def on_participant_disconnected(disconnected_participant):
        if disconnected_participant.identity == participant.identity:
            logger.info("Participant disconnected - saving to Notion")
            save_conversation_to_notion()


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
