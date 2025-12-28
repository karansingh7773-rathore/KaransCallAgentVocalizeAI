export interface Turn {
  role: 'user' | 'model';
  text: string;
  timestamp: Date;
  isComplete: boolean;
}

export interface StreamConfig {
  sampleRate: number;
}

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

export type AgentState = 'disconnected' | 'connecting' | 'listening' | 'thinking' | 'speaking';

export interface TokenRequest {
  userName: string;
  persona?: string;
  businessDetails?: string;
}

export interface TokenResponse {
  token: string;
  roomName: string;
  serverUrl: string;
}