import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as PIXI from 'pixi.js';

// CRITICAL: Expose PIXI to window BEFORE importing Live2DModel
if (typeof window !== 'undefined') {
    (window as any).PIXI = PIXI;
}

// Import after PIXI is exposed
import { Live2DModel, MotionPriority } from 'pixi-live2d-display/cubism4';

interface AvatarCanvasProps {
    volume: number;
    isConnected: boolean;
    agentState: 'disconnected' | 'connecting' | 'listening' | 'thinking' | 'speaking';
}

const AvatarCanvas: React.FC<AvatarCanvasProps> = ({ volume, isConnected, agentState }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const appRef = useRef<PIXI.Application | null>(null);
    const modelRef = useRef<any>(null);
    const mountIdRef = useRef<number>(0); // Track mount instance
    const [modelLoaded, setModelLoaded] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const smoothedVolumeRef = useRef<number>(0);
    const animationFrameRef = useRef<number | null>(null);

    // Initialize PixiJS and load the model
    useEffect(() => {
        if (!containerRef.current) return;

        // Increment mount ID - only the latest mount will render
        const currentMountId = ++mountIdRef.current;
        
        // Small delay to ensure the container has been laid out
        const initTimer = setTimeout(() => {
            if (!containerRef.current) return;
            if (currentMountId !== mountIdRef.current) return; // Check if still current
            
            const container = containerRef.current;
            
            // Use window dimensions as fallback - container might not have dimensions yet
            const width = container.clientWidth || window.innerWidth || 800;
            const height = container.clientHeight || window.innerHeight || 600;
            
            console.log(`Canvas dimensions: ${width}x${height}`);

            // Create canvas element
            const canvas = document.createElement('canvas');
            canvas.style.position = 'absolute';
            canvas.style.top = '0';
            canvas.style.left = '0';
            canvas.style.width = '100%';
            canvas.style.height = '100%';
            container.appendChild(canvas);

            // Initialize Pixi Application
            const app = new PIXI.Application({
                view: canvas,
                width,
                height,
                backgroundAlpha: 0,
                resolution: window.devicePixelRatio || 1,
                autoDensity: true,
            });

            appRef.current = app;

            // Load Model
            const modelPath = '/models/huohuo/huohuo.model3.json';

            Live2DModel.from(modelPath).then((model) => {
            // Check if this is still the current mount
            if (currentMountId !== mountIdRef.current) {
                console.log(`Mount ${currentMountId} superseded by ${mountIdRef.current}, discarding model`);
                model.destroy();
                return;
            }

            // Check if app is still valid
            if (!appRef.current || !appRef.current.stage) {
                console.warn("App no longer valid, discarding model");
                model.destroy();
                return;
            }

            modelRef.current = model;
            
            // Cast to any to access PIXI.Container properties not exposed in Live2DModel types
            const modelAny = model as any;

            // Calculate scale to fit - aim for model to take up most of the height
            const modelWidth = modelAny.width || 800;
            const modelHeight = modelAny.height || 600;
            
            // Scale to fit 80% of the canvas height
            const targetHeight = height * 0.85;
            const scale = targetHeight / modelHeight;

            console.log(`Model original size: ${modelWidth}x${modelHeight}`);
            console.log(`Canvas: ${width}x${height}, Target height: ${targetHeight}`);
            console.log(`Scale: ${scale}`);

            modelAny.scale.set(scale);
            // Position at center horizontally, and slightly lower to show full character
            modelAny.anchor.set(0.5, 0.5);
            modelAny.position.set(width / 2, height * 0.55);

            console.log('Live2D model loaded successfully!');
            console.log(`Model final scale: ${modelAny.scale?.x}, position: (${modelAny.position?.x}, ${modelAny.position?.y})`);

            // Add to stage
            app.stage.addChild(model as unknown as PIXI.DisplayObject);

            // Start idle motion - this will loop automatically
            try {
                // Start the first idle motion (MotionPriority.IDLE = 1)
                model.motion('Idle', 0, MotionPriority.IDLE);
                console.log('Started idle motion');
                
                // Set up motion finished callback to play random idle motions
                model.on('motionFinish', (group: string, index: number, audio: any) => {
                    if (group === 'Idle') {
                        // Play a random idle motion
                        const randomIndex = Math.floor(Math.random() * 3);
                        model.motion('Idle', randomIndex, MotionPriority.IDLE);
                    }
                });
            } catch (err) {
                console.warn('Could not start idle motion:', err);
            }

            // Mouse tracking for eye follow
            const onMouseMove = (e: MouseEvent) => {
                if (!modelRef.current) return;
                const rect = container.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const y = e.clientY - rect.top;
                modelRef.current.focus(x, y);
            };
            container.addEventListener('mousemove', onMouseMove);
            
            // Click to trigger random motion
            const onClick = () => {
                if (!modelRef.current) return;
                const randomIndex = Math.floor(Math.random() * 3);
                modelRef.current.motion('TapBody', randomIndex);
            };
            container.addEventListener('click', onClick);

            setModelLoaded(true);
            setError(null);

        }).catch((err) => {
            if (currentMountId !== mountIdRef.current) return; // Ignore errors from old mounts
            console.error('Failed to load Live2D model:', err);
            setError(err instanceof Error ? err.message : 'Failed to load avatar');
        });
        
        }, 100); // End of setTimeout callback

        // Cleanup
        return () => {
            clearTimeout(initTimer);
            // Don't increment mountId here - let the new mount do it
            if (animationFrameRef.current) {
                cancelAnimationFrame(animationFrameRef.current);
                animationFrameRef.current = null;
            }
            if (modelRef.current) {
                try { modelRef.current.destroy(); } catch {}
                modelRef.current = null;
            }
            if (appRef.current) {
                try { appRef.current.destroy(true, { children: true }); } catch {}
                appRef.current = null;
            }
            // Remove canvas from container
            if (containerRef.current) {
                while (containerRef.current.firstChild) {
                    containerRef.current.removeChild(containerRef.current.firstChild);
                }
            }
            setModelLoaded(false);
        };
    }, []);

    // Track if currently in speaking motion
    const isSpeakingMotionRef = useRef(false);

    // Trigger speaking motion and expression when agent starts speaking
    useEffect(() => {
        if (!modelLoaded || !modelRef.current) return;

        const model = modelRef.current;
        
        if (agentState === 'speaking' && !isSpeakingMotionRef.current) {
            isSpeakingMotionRef.current = true;
            try {
                // Play a speaking motion (MotionPriority.NORMAL = 2 to override idle)
                const speakIndex = Math.floor(Math.random() * 2);
                model.motion('Speak', speakIndex, MotionPriority.NORMAL);
                console.log('Playing speak motion');
            } catch (err) {
                console.warn('Could not play speak motion:', err);
            }
        } else if (agentState !== 'speaking' && isSpeakingMotionRef.current) {
            isSpeakingMotionRef.current = false;
            try {
                // Return to idle motion
                const idleIndex = Math.floor(Math.random() * 3);
                model.motion('Idle', idleIndex, MotionPriority.IDLE);
                console.log('Returning to idle motion');
            } catch (err) {
                console.warn('Could not return to idle:', err);
            }
        }
    }, [agentState, modelLoaded]);

    // Lip-sync animation loop
    useEffect(() => {
        if (!isConnected || !modelLoaded) return;

        const updateLipSync = () => {
            if (!modelRef.current?.internalModel?.coreModel) {
                animationFrameRef.current = requestAnimationFrame(updateLipSync);
                return;
            }

            // Only open mouth when speaking
            let targetVolume = 0;
            if (agentState === 'speaking') {
                targetVolume = Math.min(1, (volume / 80) * 1.2);
            }

            // Smooth the volume
            const smoothing = 0.25;
            smoothedVolumeRef.current += (targetVolume - smoothedVolumeRef.current) * smoothing;

            // Try to set mouth parameter
            try {
                const coreModel = modelRef.current.internalModel.coreModel;
                if (coreModel?.setParameterValueById) {
                    coreModel.setParameterValueById('ParamMouthOpenY', smoothedVolumeRef.current);
                }
            } catch {}

            animationFrameRef.current = requestAnimationFrame(updateLipSync);
        };

        animationFrameRef.current = requestAnimationFrame(updateLipSync);

        return () => {
            if (animationFrameRef.current) {
                cancelAnimationFrame(animationFrameRef.current);
                animationFrameRef.current = null;
            }
        };
    }, [isConnected, modelLoaded, volume, agentState]);

    return (
        <div className="relative w-full h-full flex items-center justify-center overflow-hidden bg-stone-950">
            {/* Solid Background with subtle gradient */}
            <div className="absolute inset-0 bg-gradient-to-b from-teal-900/20 via-stone-950 to-stone-950" />

            {/* Decorative glow */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div
                    className={`w-96 h-96 rounded-full blur-3xl transition-all duration-500 ${
                        agentState === 'speaking'
                            ? 'bg-teal-500/20 scale-110'
                            : agentState === 'thinking'
                            ? 'bg-amber-500/15 scale-100 animate-pulse'
                            : 'bg-teal-600/10 scale-100'
                    }`}
                />
            </div>

            {/* Container for Live2D canvas */}
            <div
                ref={containerRef}
                className="absolute inset-0 z-10"
                style={{ touchAction: 'none' }}
            />

            {/* Loading indicator */}
            {!modelLoaded && !error && (
                <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-20">
                    <div className="flex items-center gap-3 bg-stone-900/90 backdrop-blur-sm rounded-full px-6 py-3 border border-stone-700">
                        <div className="w-4 h-4 border-2 border-teal-400 border-t-transparent rounded-full animate-spin" />
                        <span className="text-sm text-stone-300">Loading Avatar...</span>
                    </div>
                </div>
            )}

            {/* Error display */}
            {error && (
                <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-20">
                    <div className="flex items-center gap-3 bg-red-900/90 backdrop-blur-sm rounded-lg px-6 py-3 border border-red-700">
                        <span className="text-sm text-red-200">Error: {error}</span>
                    </div>
                </div>
            )}

            {/* Status indicator */}
            <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-20">
                <div className="flex items-center gap-2 bg-stone-900/80 backdrop-blur-sm rounded-full px-4 py-2 border border-stone-800">
                    <span
                        className={`w-2 h-2 rounded-full ${
                            agentState === 'speaking'
                                ? 'bg-teal-400 animate-pulse'
                                : agentState === 'thinking'
                                ? 'bg-amber-400 animate-pulse'
                                : agentState === 'listening'
                                ? 'bg-emerald-400'
                                : 'bg-stone-500'
                        }`}
                    />
                    <span className="text-xs text-stone-400 font-medium uppercase tracking-wider">
                        {agentState === 'speaking'
                            ? 'Speaking'
                            : agentState === 'thinking'
                            ? 'Thinking'
                            : agentState === 'listening'
                            ? 'Listening'
                            : 'Ready'}
                    </span>
                </div>
            </div>
        </div>
    );
};

export default AvatarCanvas;
