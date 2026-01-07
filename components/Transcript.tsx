import React from 'react';
import { Turn } from '../types';

interface TranscriptProps {
    turns: Turn[];
    currentTurn: { input: string; output: string } | null;
}

const Transcript: React.FC<TranscriptProps> = ({ turns, currentTurn }) => {
    // Live/persisted text from currentTurn
    const agentText = currentTurn?.output || '';
    const userText = currentTurn?.input || '';

    // Priority:
    // 1. Agent text (current or persisted)
    // 2. User text (current or persisted)
    // 3. Listening... (initial state before anyone speaks)

    if (agentText) {
        // Agent speaking or agent's text persisting
        return (
            <div className="text-center max-w-3xl mx-auto">
                <div className="text-xs uppercase tracking-wider mb-2 text-rose-400">Agent</div>
                <p className="text-2xl text-white">
                    {agentText}
                    <span className="inline-block w-0.5 h-5 ml-1 bg-rose-500 animate-pulse"></span>
                </p>
            </div>
        );
    }

    if (userText) {
        // User speaking or user's text persisting until agent responds
        return (
            <div className="text-center max-w-3xl mx-auto">
                <div className="text-xs uppercase tracking-wider mb-2 text-stone-500">You</div>
                <p className="text-2xl text-stone-300">
                    {userText}
                    <span className="inline-block w-0.5 h-5 ml-1 bg-stone-400 animate-pulse"></span>
                </p>
            </div>
        );
    }

    // No text yet - waiting for first speaker
    return (
        <div className="text-stone-500 text-lg">
            Listening...
        </div>
    );
};

export default Transcript;