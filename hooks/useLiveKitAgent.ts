import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Room,
  RoomEvent,
  ConnectionState,
  RemoteParticipant,
  RemoteTrack,
  Track,
  Participant,
  TranscriptionSegment,
  DataPacket_Kind,
} from 'livekit-client';
import type { Turn, ConnectionState as AppConnectionState } from '../types';

interface UseLiveKitAgentProps {
  serverUrl: string;
  agentPersona: string;
  businessDetails: string;
  userName: string;
}

// FFT frequency data for lip sync
interface FrequencyData {
  low: number;   // 0-300Hz: O, U sounds (bass)
  mid: number;   // 300-2000Hz: A, E sounds (vowels)
  high: number;  // 2000-8000Hz: S, T, F sounds (consonants)
  volume: number; // Overall volume
}

interface UseLiveKitAgentReturn {
  connect: () => Promise<void>;
  disconnect: () => void;
  status: AppConnectionState;
  transcripts: Turn[];
  currentTurn: { input: string; output: string } | null;
  currentVolume: number;
  frequencyData: FrequencyData;
  agentState: 'disconnected' | 'connecting' | 'listening' | 'thinking' | 'speaking';
  currentAction: string | null; // NEW: Action command for avatar (Wave, Nod, Wink, WagTail)
  emailPopupOpen: boolean;
  submitEmailToAgent: (email: string) => void;
  closeEmailPopup: () => void;
  searchSources: { url: string; title: string }[];
}

const TOKEN_API_URL = '/api/token';

export function useLiveKitAgent({
  serverUrl,
  agentPersona,
  businessDetails,
  userName,
}: UseLiveKitAgentProps): UseLiveKitAgentReturn {
  // State - keep same order as before
  const [status, setStatus] = useState<AppConnectionState>('disconnected');
  const [transcripts, setTranscripts] = useState<Turn[]>([]);
  const [currentTurn, setCurrentTurn] = useState<{ input: string; output: string } | null>(null);
  const [currentVolume, setCurrentVolume] = useState<number>(0);
  const [frequencyData, setFrequencyData] = useState<FrequencyData>({ low: 0, mid: 0, high: 0, volume: 0 });
  const [agentState, setAgentState] = useState<'disconnected' | 'connecting' | 'listening' | 'thinking' | 'speaking'>('disconnected');
  const [currentAction, setCurrentAction] = useState<string | null>(null);
  const [emailPopupOpen, setEmailPopupOpen] = useState<boolean>(false);
  const [searchSources, setSearchSources] = useState<{ url: string; title: string }[]>([]);

  // Refs - keep same order as before
  const roomRef = useRef<Room | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const currentTurnRef = useRef<{ input: string; output: string }>({ input: '', output: '' });
  // Use object ref to track processed segments (not a new ref, combined with currentTurnRef pattern)
  const processedRef = useRef<{ segments: Set<string> }>({ segments: new Set() });

  // Cleanup function
  const cleanup = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    document.querySelectorAll('#agent-audio').forEach(el => el.remove());

    if (roomRef.current) {
      roomRef.current.disconnect();
      roomRef.current = null;
    }
    processedRef.current.segments.clear();
    setCurrentVolume(0);
    setAgentState('disconnected');
    setEmailPopupOpen(false);
  }, []);

  // Audio visualization AND playback
  const setupAudioVisualization = useCallback((track: RemoteTrack) => {
    try {
      const audioElement = track.attach();
      audioElement.id = 'agent-audio';
      document.querySelectorAll('#agent-audio').forEach(el => el.remove());
      document.body.appendChild(audioElement);

      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }

      const audioContext = audioContextRef.current;
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256; // More bins for better frequency resolution
      analyserRef.current = analyser;

      const mediaStream = new MediaStream([track.mediaStreamTrack]);
      const source = audioContext.createMediaStreamSource(mediaStream);
      source.connect(analyser);

      // Calculate frequency bin ranges
      // Sample rate is typically 48000Hz, with fftSize=256 we get 128 bins
      // Each bin represents ~187.5Hz (48000 / 256)
      const sampleRate = audioContext.sampleRate;
      const binCount = analyser.frequencyBinCount; // 128 bins
      const binSize = sampleRate / analyser.fftSize; // Hz per bin

      // Frequency ranges for lip sync:
      // Low (bass): 0-300Hz - O, U sounds
      // Mid (vowels): 300-2000Hz - A, E sounds  
      // High (consonants): 2000-8000Hz - S, T, F sounds
      const lowEnd = Math.floor(300 / binSize);
      const midEnd = Math.floor(2000 / binSize);
      const highEnd = Math.min(Math.floor(8000 / binSize), binCount);

      let lastUpdate = 0;
      const THROTTLE_MS = 33; // 30fps for smoother lip sync

      const visualize = () => {
        if (!analyserRef.current) return;

        const now = performance.now();
        if (now - lastUpdate >= THROTTLE_MS) {
          lastUpdate = now;

          const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
          analyserRef.current.getByteFrequencyData(dataArray);

          // Calculate frequency bands for lip sync
          let lowSum = 0, midSum = 0, highSum = 0, totalSum = 0;

          for (let i = 0; i < binCount; i++) {
            const value = dataArray[i];
            totalSum += value;

            if (i < lowEnd) {
              lowSum += value;
            } else if (i < midEnd) {
              midSum += value;
            } else if (i < highEnd) {
              highSum += value;
            }
          }

          // Normalize to 0-1 range
          const low = lowEnd > 0 ? (lowSum / lowEnd) / 255 : 0;
          const mid = (midEnd - lowEnd) > 0 ? (midSum / (midEnd - lowEnd)) / 255 : 0;
          const high = (highEnd - midEnd) > 0 ? (highSum / (highEnd - midEnd)) / 255 : 0;
          const volume = totalSum / binCount;

          setCurrentVolume(volume);
          setFrequencyData({ low, mid, high, volume: volume / 255 });
        }

        animationFrameRef.current = requestAnimationFrame(visualize);
      };

      visualize();
    } catch (error) {
      console.error('Failed to set up audio:', error);
    }
  }, []);

  // Connect to LiveKit room
  const connect = useCallback(async () => {
    try {
      setStatus('connecting');
      setAgentState('connecting');

      const response = await fetch(TOKEN_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userName, persona: agentPersona, businessDetails }),
      });

      if (!response.ok) throw new Error('Failed to get token');

      const { token, roomName, serverUrl: tokenServerUrl } = await response.json();
      const connectUrl = tokenServerUrl || serverUrl;

      if (!connectUrl) throw new Error('No server URL');

      const room = new Room({ adaptiveStream: true, dynacast: true });
      roomRef.current = room;

      room.on(RoomEvent.Connected, () => {
        setStatus('connected');
        // Don't change agentState here - keep it as 'connecting' until we get real state from agent
        // The actual state will come from ParticipantAttributesChanged when agent joins
      });

      room.on(RoomEvent.Disconnected, () => {
        setStatus('disconnected');
        cleanup();
      });

      room.on(RoomEvent.ConnectionStateChanged, (state: ConnectionState) => {
        if (state === ConnectionState.Disconnected) setStatus('disconnected');
      });

      room.on(RoomEvent.ParticipantAttributesChanged, (attrs: Record<string, string>) => {
        const state = attrs['lk.agent.state'];
        if (state === 'listening' || state === 'thinking' || state === 'speaking') {
          setAgentState(state);
        }
      });

      room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack, _pub, participant: RemoteParticipant) => {
        if (track.kind === Track.Kind.Audio) {
          setupAudioVisualization(track);
        }
      });

      // Handle data messages from agent (e.g., email input popup request, actions)
      room.on(RoomEvent.DataReceived, (payload: Uint8Array) => {
        try {
          const message = JSON.parse(new TextDecoder().decode(payload));
          if (message.type === 'request_email_input') {
            console.log('Agent requested email input popup');
            setEmailPopupOpen(true);
          } else if (message.type === 'close_email_popup') {
            console.log('Agent requested to close email popup');
            setEmailPopupOpen(false);
          } else if (message.type === 'search_sources') {
            console.log('Agent sent search sources:', message.sources);
            setSearchSources(message.sources || []);
            const toolAudio = new Audio('/tool-use.mp3');
            toolAudio.play().catch(err => console.warn('Sources sound failed:', err));
          } else if (message.type === 'action') {
            // NEW: Handle avatar action commands (Wave, Nod, Wink, WagTail)
            console.log('Agent action command:', message.action);
            setCurrentAction(message.action);
            // Clear action after 2 seconds (motion should have played)
            setTimeout(() => setCurrentAction(null), 2000);
          }
        } catch (e) {
          // Ignore non-JSON messages
        }
      });

      // LIVE Transcription - word by word
      // Text persists until the OTHER speaker starts talking
      room.on(RoomEvent.TranscriptionReceived, (segments: TranscriptionSegment[], participant?: Participant) => {
        if (!segments?.length) return;

        const isAgent = participant?.identity !== userName;

        // Clear search sources when user speaks again
        if (!isAgent) {
          setSearchSources([]);
        }

        for (const seg of segments) {
          const text = seg.text?.trim();
          if (!text) continue;

          // Update live text - only clear the OTHER speaker's text, keep current speaker's text
          if (isAgent) {
            currentTurnRef.current.output = text;
            currentTurnRef.current.input = ''; // Clear user text when agent speaks
          } else {
            currentTurnRef.current.input = text;
            currentTurnRef.current.output = ''; // Clear agent text when user speaks
          }
          setCurrentTurn({ ...currentTurnRef.current });

          // On final, add to history but DO NOT clear currentTurn
          // The text will persist until the other speaker starts talking
          if (seg.final) {
            const key = `${isAgent ? 'a' : 'u'}-${seg.id}`;
            if (!processedRef.current.segments.has(key)) {
              processedRef.current.segments.add(key);

              setTranscripts(prev => [...prev, {
                role: isAgent ? 'model' : 'user',
                text,
                timestamp: new Date(),
                isComplete: true,
              }]);

              // DON'T clear currentTurn here - let the text persist
              // It will be replaced when the other speaker starts talking
            }
          }
        }
      });

      await room.connect(connectUrl, token, { autoSubscribe: true });
      await room.localParticipant.setMicrophoneEnabled(true);

    } catch (error) {
      console.error('Connection failed:', error);
      setStatus('error');
      setAgentState('disconnected');
      cleanup();
    }
  }, [serverUrl, agentPersona, businessDetails, userName, cleanup, setupAudioVisualization]);

  const disconnect = useCallback(() => {
    cleanup();
    setStatus('disconnected');
    setTranscripts([]);
    setCurrentTurn(null);
    setEmailPopupOpen(false);
    setSearchSources([]);
  }, [cleanup]);

  // Submit email from popup back to agent
  const submitEmailToAgent = useCallback((email: string) => {
    if (roomRef.current && email.trim()) {
      const data = JSON.stringify({ type: 'email_response', email: email.trim() });
      roomRef.current.localParticipant.publishData(
        new TextEncoder().encode(data),
        { reliable: true }
      );
      setEmailPopupOpen(false);
      console.log('Sent email to agent:', email);
    }
  }, []);

  useEffect(() => {
    return () => cleanup();
  }, [cleanup]);

  return {
    connect,
    disconnect,
    status,
    transcripts,
    currentTurn,
    currentVolume,
    frequencyData,
    agentState,
    currentAction,
    emailPopupOpen,
    submitEmailToAgent,
    closeEmailPopup: () => setEmailPopupOpen(false),
    searchSources,
  };
}
