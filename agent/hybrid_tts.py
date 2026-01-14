"""
Hybrid TTS Router for LiveKit Agents
=====================================
Routes TTS requests based on the detected language from STT:
  - English → Deepgram TTS
  - Hindi → Sarvam AI TTS

The language is set externally by tracking STT transcription events,
which include the detected language code.
"""

import logging
from typing import Optional

from livekit.agents import tts

logger = logging.getLogger("hybrid-tts")


class HybridTTS(tts.TTS):
    """
    Routes TTS to Deepgram (English) or Sarvam AI (Hindi).
    
    The language is set via set_language() based on STT detection.
    This allows stream() to know which TTS to use before receiving text.
    
    Usage:
        hybrid_tts = HybridTTS(english_tts, hindi_tts)
        
        # When STT detects language, call:
        hybrid_tts.set_language("hi")  # or "en"
        
        # Then when stream() is called, it will use the correct TTS
    """
    
    def __init__(
        self,
        english_tts: tts.TTS,
        hindi_tts: tts.TTS,
    ) -> None:
        # Wrap non-streaming TTS with StreamAdapter if needed
        if not hindi_tts.capabilities.streaming:
            logger.info("Wrapping Sarvam TTS with StreamAdapter")
            hindi_tts = tts.StreamAdapter(tts=hindi_tts, sentence_tokenizer=None)
        
        if not english_tts.capabilities.streaming:
            english_tts = tts.StreamAdapter(tts=english_tts, sentence_tokenizer=None)
        
        super().__init__(
            capabilities=tts.TTSCapabilities(streaming=True),
            sample_rate=english_tts.sample_rate,
            num_channels=1,
        )
        
        self._english_tts = english_tts
        self._hindi_tts = hindi_tts
        self._current_language = "en"  # Default to English
        
        logger.info("HybridTTS initialized: Deepgram (EN) + Sarvam (HI)")
    
    def set_language(self, language_code: str) -> None:
        """
        Set the current language for TTS routing.
        
        Args:
            language_code: "hi" for Hindi, "en" or anything else for English
        """
        if language_code == "hi":
            if self._current_language != "hi":
                logger.info("🔄 Language switched to HINDI (Sarvam)")
            self._current_language = "hi"
        else:
            if self._current_language != "en":
                logger.info("🔄 Language switched to ENGLISH (Deepgram)")
            self._current_language = "en"
    
    @property
    def current_language(self) -> str:
        """Get the current language setting."""
        return self._current_language
    
    def _get_current_tts(self) -> tts.TTS:
        """Get the TTS for the current language."""
        if self._current_language == "hi":
            return self._hindi_tts
        return self._english_tts
    
    def synthesize(self, text: str, **kwargs) -> tts.ChunkedStream:
        """Route synthesize to the current language's TTS."""
        if self._current_language == "hi":
            logger.info(f"🇮🇳 HINDI TTS: {text[:50]}...")
        else:
            logger.info(f"🇺🇸 ENGLISH TTS: {text[:50]}...")
        return self._get_current_tts().synthesize(text, **kwargs)
    
    def stream(self, **kwargs) -> tts.SynthesizeStream:
        """Route stream to the current language's TTS."""
        if self._current_language == "hi":
            logger.info("📡 Stream: Using Sarvam (Hindi)")
            return self._hindi_tts.stream(**kwargs)
        else:
            logger.info("📡 Stream: Using Deepgram (English)")
            return self._english_tts.stream(**kwargs)
