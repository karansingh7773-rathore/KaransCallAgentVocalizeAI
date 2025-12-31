# Use Python 3.11 slim image
FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Install system dependencies for audio processing
RUN apt-get update && apt-get install -y \
    gcc \
    libsndfile1 \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first for better caching
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Download model files for VAD
RUN python -c "from livekit.plugins import silero; silero.VAD.load()" || true

# Copy application code
COPY . .

# Expose port (LiveKit uses WebSocket, but Railway may need a health check port)
EXPOSE 8080

# Run the agent in production mode
CMD ["python", "agent.py", "start"]
