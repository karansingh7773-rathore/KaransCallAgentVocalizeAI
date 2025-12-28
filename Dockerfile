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
COPY agent/requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Pre-download VAD model file for faster startup
RUN python -c "from livekit.plugins import silero; silero.VAD.load()" || true

# Copy agent code
COPY agent/ .

# Run the agent in production mode
CMD ["python", "agent.py", "start"]
