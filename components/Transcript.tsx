import React from 'react';
import { Turn } from '../types';

interface TranscriptProps {
    turns: Turn[];
    currentTurn: { input: string; output: string } | null;
}

const Transcript: React.FC<TranscriptProps> = ({ turns, currentTurn }) => {
    // Live text takes priority
    const liveAgentText = currentTurn?.output || '';
    const liveUserText = currentTurn?.input || '';

    // Get last agent message for idle state
    const lastAgentMessage = [...turns].reverse().find(t => t.role === 'model')?.text || '';

    // Priority:
    // 1. Live agent text (when agent speaking)
    // 2. Live user text (when user speaking)
    // 3. Last agent message (when idle)

    if (liveAgentText) {
        // Agent is speaking live
        return (
            <div className="text-center max-w-3xl mx-auto">
                <div className="text-xs uppercase tracking-wider mb-2 text-rose-400">Agent</div>
                <p className="text-2xl text-white">
                    {liveAgentText}
                    <span className="inline-block w-0.5 h-5 ml-1 bg-rose-500 animate-pulse"></span>
                </p>
            </div>
        );
    }

    if (liveUserText) {
        // User is speaking live
        return (
            <div className="text-center max-w-3xl mx-auto">
                <div className="text-xs uppercase tracking-wider mb-2 text-stone-500">You</div>
                <p className="text-2xl text-stone-300">
                    {liveUserText}
                    <span className="inline-block w-0.5 h-5 ml-1 bg-stone-400 animate-pulse"></span>
                </p>
            </div>
        );
    }

    // Idle - show last agent message or waiting
    if (lastAgentMessage) {
        return (
            <div className="text-center max-w-3xl mx-auto">
                <p className="text-2xl text-stone-400">{lastAgentMessage}</p>
            </div>
        );
    }

    // No messages yet
    return (
        <div className="text-stone-500 text-lg">
            Listening...
        </div>
    );
};

export default Transcript;