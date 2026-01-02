import React, { useEffect, useState, useRef } from 'react';
import { Settings, Phone, PhoneOff, Github, X, Save, User, Briefcase, ArrowRight } from 'lucide-react';
import { DiYii } from "react-icons/di";
import { useLiveKitAgent } from './hooks/useLiveKitAgent';
import AudioVisualizer from './components/AudioVisualizer';
import Transcript from './components/Transcript';

// LiveKit server URL - set via environment variable
const LIVEKIT_URL = import.meta.env.VITE_LIVEKIT_URL || '';

function App() {
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);

    // User Name State
    const [userName, setUserName] = useState<string>('');
    const [tempName, setTempName] = useState<string>('');
    const [isNameModalOpen, setIsNameModalOpen] = useState(true);

    // Settings State - persisted to localStorage
    const [agentPersona, setAgentPersona] = useState("You are a helpful, professional AI assistant named 'Vocalize'. You are concise and friendly.");
    const [businessDetails, setBusinessDetails] = useState("Your goal is to help users with their questions and provide helpful information.");

    // Temporary settings for the modal (only applied on save)
    const [tempPersona, setTempPersona] = useState(agentPersona);
    const [tempBusinessDetails, setTempBusinessDetails] = useState(businessDetails);

    // Audio refs for sound effects
    const startCallAudioRef = useRef<HTMLAudioElement | null>(null);
    const endCallAudioRef = useRef<HTMLAudioElement | null>(null);

    // Initialize audio elements on mount
    useEffect(() => {
        startCallAudioRef.current = new Audio('/start-call.mp3');
        endCallAudioRef.current = new Audio('/end-call.mp3');

        // Preload the audio files
        startCallAudioRef.current.preload = 'auto';
        endCallAudioRef.current.preload = 'auto';
    }, []);

    // Play sound effect helper
    const playSound = (type: 'start' | 'end') => {
        const audio = type === 'start' ? startCallAudioRef.current : endCallAudioRef.current;
        if (audio) {
            audio.currentTime = 0; // Reset to start
            audio.play().catch((err) => {
                console.warn('Sound effect failed to play:', err);
            });
        }
    };

    // Load saved settings on mount
    useEffect(() => {
        // Load user name
        const savedName = localStorage.getItem('vocalize_username');
        if (savedName) {
            setUserName(savedName);
            setIsNameModalOpen(false);
        }

        // Load settings
        const savedPersona = localStorage.getItem('vocalize_persona');
        const savedBusiness = localStorage.getItem('vocalize_business');

        if (savedPersona) {
            setAgentPersona(savedPersona);
            setTempPersona(savedPersona);
        }
        if (savedBusiness) {
            setBusinessDetails(savedBusiness);
            setTempBusinessDetails(savedBusiness);
        }
    }, []);

    // LiveKit hook with settings
    const {
        connect,
        disconnect,
        status,
        transcripts,
        currentTurn,
        currentVolume,
        agentState
    } = useLiveKitAgent({
        serverUrl: LIVEKIT_URL,
        agentPersona,
        businessDetails,
        userName,
    });

    const toggleConnection = () => {
        if (status === 'connected' || status === 'connecting') {
            playSound('end');
            disconnect();
        } else {
            playSound('start');
            connect();
        }
    };

    const handleSaveSettings = () => {
        // Apply temporary settings
        setAgentPersona(tempPersona);
        setBusinessDetails(tempBusinessDetails);

        // Persist to localStorage
        localStorage.setItem('vocalize_persona', tempPersona);
        localStorage.setItem('vocalize_business', tempBusinessDetails);

        setIsSettingsOpen(false);
    };

    const handleOpenSettings = () => {
        // Sync temp values with current values when opening
        setTempPersona(agentPersona);
        setTempBusinessDetails(businessDetails);
        setIsSettingsOpen(true);
    };

    const handleNameSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (tempName.trim()) {
            const name = tempName.trim();
            setUserName(name);
            localStorage.setItem('vocalize_username', name);
            setIsNameModalOpen(false);

            // Log user to Google Sheets (fire-and-forget, don't block UI)
            fetch('/api/sheets', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userName: name }),
            }).catch(() => { }); // Silently ignore errors
        }
    };

    // Smoke Animation: Splits by letter
    const renderAnimatedText = (text: string) => {
        return text.split('').map((char, index) => (
            <span key={index} className="inline-block">
                {char === ' ' ? (
                    <span className="inline-block w-3 md:w-4"></span>
                ) : (
                    <span
                        className="smoke-animate"
                        style={{ animationDelay: `${0.2 + index * 0.06}s` }}
                    >
                        {char}
                    </span>
                )}
            </span>
        ));
    };

    // Get status display text
    const getStatusText = () => {
        switch (agentState) {
            case 'connecting':
                return 'Connecting...';
            case 'listening':
                return 'Listening...';
            case 'thinking':
                return 'Thinking...';
            case 'speaking':
                return 'Speaking...';
            default:
                return status === 'connected' ? 'Connected' : 'System Ready';
        }
    };

    // Main UI Content
    const mainUIContent = (
        <div className="relative z-10 max-w-7xl mx-auto space-y-8 p-4 md:p-8 flex flex-col min-h-screen">
            {/* Decorative Lines */}
            <div className="fixed inset-0 pointer-events-none z-0 flex justify-between px-4 md:px-24 opacity-10">
                <div className="w-px h-full bg-stone-500"></div>
                <div className="w-px h-full bg-stone-500"></div>
                <div className="w-px h-full bg-stone-500"></div>
                <div className="w-px h-full bg-stone-500"></div>
            </div>

            {/* Header */}
            <header className="relative z-20 flex justify-between items-center py-4 border-b border-stone-800/50">
                <div className="flex items-center gap-4">
                    <div className="h-10 w-10 bg-rose-500 rounded-xl flex items-center justify-center shadow-lg shadow-rose-900/20">
                        <DiYii className="text-stone-950" size={28} />
                    </div>
                    <div>
                        <h1 className="text-3xl tracking-normal font-heading">
                            <span className="text-stone-100">Vocalize</span> <span className="text-rose-500">AI</span>
                        </h1>
                    </div>
                </div>

                <div className="flex items-center gap-6">
                    {status === 'connected' && (
                        <div className="flex items-center gap-2 text-xs font-semibold text-stone-500 uppercase tracking-widest animate-pulse">
                            <span className={`w-2 h-2 rounded-full ${agentState === 'speaking' ? 'bg-rose-500' :
                                agentState === 'thinking' ? 'bg-amber-500' :
                                    'bg-emerald-500'
                                }`}></span>
                            {getStatusText()}
                        </div>
                    )}
                    <button
                        onClick={handleOpenSettings}
                        className="p-2 rounded-full hover:bg-stone-800 transition-colors group relative"
                    >
                        <Settings className="text-stone-400 group-hover:text-rose-400 transition-transform group-hover:rotate-90 duration-500" size={24} />
                        {status === 'connected' && <span className="absolute right-0 top-0 w-2 h-2 bg-rose-500 rounded-full"></span>}
                    </button>
                </div>
            </header>

            {/* Main Content Area */}
            <main className="flex-grow flex items-center justify-center relative z-20">
                <section className="w-full max-w-4xl mx-auto flex flex-col items-center justify-center text-center space-y-12">
                    {/* Dynamic Content: Greeting vs Transcript */}
                    {status === 'connected' ? (
                        <Transcript turns={transcripts} currentTurn={currentTurn} />
                    ) : (
                        <div className="space-y-6 animate-scale-in">
                            {/* Dynamic Greeting with Smoke Effect */}
                            <h2 className="text-5xl md:text-7xl text-stone-100 font-heading tracking-normal leading-tight md:leading-snug py-2">
                                {renderAnimatedText(userName ? `Hello ${userName}` : `Hello Friend`)}
                            </h2>
                            <p className="text-xl text-stone-400 font-light max-w-lg mx-auto">
                                Press the start button below to begin the voice interaction.
                            </p>
                        </div>
                    )}

                    {/* Status/Visualizer Container */}
                    <div className="w-full flex flex-col items-center gap-8">
                        {/* Audio Visualizer */}
                        <div className="h-32 flex items-center justify-center w-full">
                            <AudioVisualizer volume={currentVolume} isConnected={status === 'connected'} />
                        </div>

                        {/* Main Action Button */}
                        <div className={`rounded-full p-[3px] transition-all transform hover:scale-105 ${status === 'connecting' ? 'opacity-50 cursor-not-allowed' : ''} ${status === 'connected'
                            ? 'bg-transparent shadow-none'
                            : 'bg-gradient-to-r from-rose-500 via-indigo-500 to-rose-500 animate-gradient-x shadow-[0_0_40px_rgba(244,63,94,0.4)]'
                            }`}>
                            <button
                                onClick={toggleConnection}
                                disabled={status === 'connecting'}
                                className={`px-10 py-5 rounded-full font-semibold text-lg tracking-tight flex items-center gap-3 w-full h-full disabled:opacity-50 disabled:cursor-not-allowed ${status === 'connected'
                                    ? 'bg-rose-600 hover:bg-rose-500 text-white'
                                    : status === 'connecting'
                                        ? 'bg-amber-600 text-white'
                                        : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                                    }`}
                            >
                                {status === 'connected' ? <PhoneOff size={24} /> : <Phone size={24} />}
                                {status === 'connected' ? 'End Interaction' : status === 'connecting' ? 'Connecting...' : 'Start Call'}
                            </button>
                        </div>

                        {/* Simplified Status Text */}
                        <div className="text-xs text-stone-500 font-medium uppercase tracking-widest">
                            {getStatusText()}
                        </div>
                    </div>
                </section>
            </main>

            {/* Footer */}
            <footer className="relative z-20 flex justify-between items-center py-6 border-t border-stone-800/50 text-xs text-stone-600 mt-auto">
                <div className="flex gap-4">
                    <a href="https://github.com/karansingh7773-rathore" target="_blank" rel="noopener noreferrer" className="hover:text-stone-400 transition-colors">
                        <Github size={18} />
                    </a>
                </div>
                <div>
                    v3.0.0 • LiveKit Powered
                </div>
            </footer>
        </div>
    );

    return (
        <>
            {/* Main Background UI - Blurred when modal is open */}
            <div className={`transition-all duration-700 ${isNameModalOpen ? 'blur-lg scale-95 opacity-40 pointer-events-none' : 'blur-0 scale-100 opacity-100'}`}>
                {mainUIContent}
            </div>

            {/* Name Modal Layer */}
            {isNameModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center animate-scale-in px-4">
                    {/* Background Video - plays behind the box */}
                    <video
                        autoPlay
                        loop
                        muted
                        playsInline
                        className="absolute inset-0 w-full h-full object-cover"
                        style={{ filter: 'blur(8px)' }}
                    >
                        <source src="/rose1.mp4" type="video/mp4" />
                    </video>
                    {/* Dark overlay on top of video */}
                    <div className="absolute inset-0 bg-black/60"></div>
                    {/* 
            Fix for Edges: 
            Use a wrapper div that has the gradient background.
            Adjusted dimensions and padding for a more compact, "short" look as requested.
          */}
                    <div className="relative z-10 w-full max-w-[340px] rounded-[28px] p-[2px] bg-gradient-to-r from-rose-500 via-fuchsia-500 to-rose-500 animate-gradient-x shadow-[0_0_40px_rgba(244,63,94,0.4)]">
                        <div className="w-full bg-[#1a1a1a] rounded-[26px] overflow-hidden">
                            <div className="p-8 flex flex-col items-center space-y-6"> {/* Reduced padding and vertical spacing */}
                                {/* Icon */}
                                <div className="w-10 h-10 rounded-xl bg-stone-800/50 flex items-center justify-center border border-stone-700/50">
                                    <User className="text-stone-400" size={18} strokeWidth={1.5} />
                                </div>

                                {/* Text */}
                                <div className="text-center space-y-1.5">
                                    <h2 className="text-2xl font-heading text-stone-200 tracking-wide">Who's speaking?</h2>
                                    <p className="text-[11px] text-stone-500 font-medium max-w-[200px] mx-auto leading-relaxed">
                                        Please enter your name to personalize the session.
                                    </p>
                                </div>

                                {/* Form */}
                                <form onSubmit={handleNameSubmit} className="w-full space-y-3">
                                    <input
                                        type="text"
                                        value={tempName}
                                        onChange={(e) => setTempName(e.target.value)}
                                        placeholder="Your Name"
                                        className="w-full bg-[#111] border border-stone-800 rounded-lg py-3 px-4 text-center text-stone-200 placeholder:text-stone-600 focus:outline-none focus:border-rose-500/30 transition-colors text-sm"
                                        autoFocus
                                    />
                                    <button
                                        type="submit"
                                        disabled={!tempName.trim()}
                                        className={`w-full py-3 rounded-lg font-medium transition-all flex items-center justify-center gap-2 group disabled:opacity-50 disabled:cursor-not-allowed text-sm ${tempName.trim()
                                            ? 'bg-stone-100 hover:bg-white text-stone-900 shadow-lg shadow-white/10'
                                            : 'bg-white/10 hover:bg-white/15 text-stone-300'
                                            }`}
                                    >
                                        Continue
                                        <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
                                    </button>
                                </form>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Settings Modal */}
            {isSettingsOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-scale-in">
                    <div className="bg-stone-900 border border-stone-800 w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden">
                        <div className="p-6 border-b border-stone-800 flex justify-between items-center bg-stone-900/50">
                            <div className="flex items-center gap-3">
                                <div className="bg-stone-800 p-2 rounded-xl">
                                    <Settings size={20} className="text-rose-400" />
                                </div>
                                <h3 className="text-xl font-heading text-stone-100">Configuration</h3>
                            </div>
                            <button
                                onClick={() => setIsSettingsOpen(false)}
                                className="text-stone-500 hover:text-stone-300 transition-colors"
                            >
                                <X size={24} />
                            </button>
                        </div>

                        <div className="p-6 space-y-6 max-h-[60vh] overflow-y-auto custom-scrollbar">
                            <div className="space-y-3">
                                <div className="flex items-center gap-2">
                                    <User size={16} className="text-rose-400" />
                                    <label className="text-xs font-bold uppercase tracking-widest text-stone-500">Agent Persona</label>
                                </div>
                                <textarea
                                    value={tempPersona}
                                    onChange={(e) => setTempPersona(e.target.value)}
                                    className="w-full bg-stone-950 border border-stone-800 rounded-2xl p-4 text-sm text-stone-300 focus:outline-none focus:border-rose-500/50 focus:ring-1 focus:ring-rose-500/20 transition-all resize-y min-h-[100px]"
                                    placeholder="Describe how the agent should behave..."
                                />
                                <p className="text-[10px] text-stone-500">Define the tone, name, and role of the AI assistant.</p>
                            </div>

                            <div className="space-y-3">
                                <div className="flex items-center gap-2">
                                    <Briefcase size={16} className="text-rose-400" />
                                    <label className="text-xs font-bold uppercase tracking-widest text-stone-500">Business Details</label>
                                </div>
                                <textarea
                                    value={tempBusinessDetails}
                                    onChange={(e) => setTempBusinessDetails(e.target.value)}
                                    className="w-full bg-stone-950 border border-stone-800 rounded-2xl p-4 text-sm text-stone-300 focus:outline-none focus:border-rose-500/50 focus:ring-1 focus:ring-rose-500/20 transition-all resize-y min-h-[100px]"
                                    placeholder="Add specific business context, pricing, or instructions..."
                                />
                                <p className="text-[10px] text-stone-500">Provide knowledge the agent needs to answer user questions.</p>
                            </div>

                            {status === 'connected' && (
                                <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4">
                                    <p className="text-amber-400 text-xs">
                                        ⚠️ Settings will apply to your next call. End the current call and start a new one to use updated settings.
                                    </p>
                                </div>
                            )}
                        </div>

                        <div className="p-6 border-t border-stone-800 bg-stone-900/50">
                            <button
                                onClick={handleSaveSettings}
                                className="w-full py-4 rounded-xl bg-stone-100 hover:bg-white text-stone-900 font-bold transition-all transform hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-2 shadow-lg"
                            >
                                <Save size={18} />
                                Save Configuration
                            </button>
                            <p className="text-center text-[10px] text-stone-600 mt-3">Changes will apply to the next interaction.</p>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}

export default App;