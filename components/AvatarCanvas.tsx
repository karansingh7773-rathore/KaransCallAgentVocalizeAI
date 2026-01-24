import React, { useEffect, useRef, useState } from 'react';
import * as PIXI from 'pixi.js';
import { getModelPath, DEFAULT_MODEL_ID } from './avatarModels';

// CRITICAL: Expose PIXI to window BEFORE importing Live2DModel
if (typeof window !== 'undefined') {
    (window as any).PIXI = PIXI;
}

// Import after PIXI is exposed
import { Live2DModel, MotionPriority } from 'pixi-live2d-display/cubism4';

// FFT frequency data for enhanced lip sync
interface FrequencyData {
    low: number;   // 0-300Hz: O, U sounds
    mid: number;   // 300-2000Hz: A, E sounds
    high: number;  // 2000-8000Hz: S, T, F sounds
    volume: number;
}

interface AvatarCanvasProps {
    volume: number;
    isConnected: boolean;
    agentState: 'disconnected' | 'connecting' | 'listening' | 'thinking' | 'speaking';
    modelId?: string;
    frequencyData?: FrequencyData;
    action?: string | null; // NEW: Action command (Wave, Nod, Wink, WagTail)
}

const AvatarCanvas: React.FC<AvatarCanvasProps> = ({
    volume,
    isConnected,
    agentState,
    modelId = DEFAULT_MODEL_ID,
    frequencyData,
    action
}) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const appRef = useRef<PIXI.Application | null>(null);
    const modelRef = useRef<any>(null);
    const mountIdRef = useRef<number>(0);
    const [modelLoaded, setModelLoaded] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Animation refs
    const smoothedVolumeRef = useRef<number>(0);
    const animationFrameRef = useRef<number | null>(null);
    const isSpeakingMotionRef = useRef(false);

    // NEW: Enhanced animation refs
    const breathingPhaseRef = useRef<number>(0);
    const headSwayPhaseRef = useRef<number>(0);
    const nextBlinkTimeRef = useRef<number>(0);
    const blinkProgressRef = useRef<number>(-1); // -1 = not blinking
    const lastTimeRef = useRef<number>(performance.now());
    const currentExpressionRef = useRef<string | null>(null);

    // Initialize PixiJS and load the model
    useEffect(() => {
        if (!containerRef.current) return;

        const currentMountId = ++mountIdRef.current;

        const initTimer = setTimeout(() => {
            if (!containerRef.current) return;
            if (currentMountId !== mountIdRef.current) return;

            const container = containerRef.current;
            const width = container.clientWidth || window.innerWidth || 800;
            const height = container.clientHeight || window.innerHeight || 600;

            console.log(`Canvas dimensions: ${width}x${height}`);

            const canvas = document.createElement('canvas');
            canvas.style.position = 'absolute';
            canvas.style.top = '0';
            canvas.style.left = '0';
            canvas.style.width = '100%';
            canvas.style.height = '100%';
            container.appendChild(canvas);

            const app = new PIXI.Application({
                view: canvas,
                width,
                height,
                backgroundAlpha: 0,
                resolution: window.devicePixelRatio || 1,
                autoDensity: true,
            });

            appRef.current = app;

            // Use model registry to get the correct path
            const modelPath = getModelPath(modelId);
            console.log(`Loading model: ${modelId} from ${modelPath}`);

            Live2DModel.from(modelPath).then((model) => {
                if (currentMountId !== mountIdRef.current) {
                    console.log(`Mount ${currentMountId} superseded, discarding model`);
                    model.destroy();
                    return;
                }

                if (!appRef.current || !appRef.current.stage) {
                    console.warn("App no longer valid, discarding model");
                    model.destroy();
                    return;
                }

                modelRef.current = model;
                const modelAny = model as any;

                const modelWidth = modelAny.width || 800;
                const modelHeight = modelAny.height || 600;
                const targetHeight = height * 0.85;
                const scale = targetHeight / modelHeight;

                console.log(`Model size: ${modelWidth}x${modelHeight}, Scale: ${scale}`);

                modelAny.scale.set(scale);
                modelAny.anchor.set(0.5, 0.5);
                modelAny.position.set(width / 2, height * 0.55);

                app.stage.addChild(model as unknown as PIXI.DisplayObject);

                // Start idle motion
                try {
                    model.motion('Idle', 0, MotionPriority.IDLE);
                    console.log('Started idle motion');

                    model.on('motionFinish', (group: string) => {
                        if (group === 'Idle') {
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
                    modelRef.current.focus(e.clientX - rect.left, e.clientY - rect.top);
                };
                container.addEventListener('mousemove', onMouseMove);

                // Click to trigger random interaction motion
                const onClick = () => {
                    if (!modelRef.current) return;
                    const randomIndex = Math.floor(Math.random() * 3);
                    modelRef.current.motion('TapBody', randomIndex);
                };
                container.addEventListener('click', onClick);

                // Initialize blink timer
                nextBlinkTimeRef.current = performance.now() + 2000 + Math.random() * 3000;

                setModelLoaded(true);
                setError(null);
                console.log('Live2D model loaded with enhanced animations!');

            }).catch((err) => {
                if (currentMountId !== mountIdRef.current) return;
                console.error('Failed to load Live2D model:', err);
                setError(err instanceof Error ? err.message : 'Failed to load avatar');
            });

        }, 100);

        return () => {
            clearTimeout(initTimer);
            if (animationFrameRef.current) {
                cancelAnimationFrame(animationFrameRef.current);
                animationFrameRef.current = null;
            }
            if (modelRef.current) {
                try { modelRef.current.destroy(); } catch { }
                modelRef.current = null;
            }
            if (appRef.current) {
                try { appRef.current.destroy(true, { children: true }); } catch { }
                appRef.current = null;
            }
            if (containerRef.current) {
                while (containerRef.current.firstChild) {
                    containerRef.current.removeChild(containerRef.current.firstChild);
                }
            }
            setModelLoaded(false);
        };
    }, [modelId]); // Reload when modelId changes

    // Expression changes based on agent state
    useEffect(() => {
        if (!modelLoaded || !modelRef.current) return;

        const model = modelRef.current;

        try {
            if (agentState === 'thinking' && currentExpressionRef.current !== 'qizi1') {
                // Show curious/thinking expression
                model.expression('qizi1');
                currentExpressionRef.current = 'qizi1';
                console.log('Set thinking expression: qizi1');
            } else if (agentState === 'speaking' && currentExpressionRef.current !== null) {
                // Reset to default expression when speaking
                model.expression();
                currentExpressionRef.current = null;
                console.log('Reset to default expression');
            } else if (agentState === 'listening' && currentExpressionRef.current !== null) {
                // Neutral attentive expression
                model.expression();
                currentExpressionRef.current = null;
            }
        } catch (err) {
            console.warn('Could not set expression:', err);
        }
    }, [agentState, modelLoaded]);

    // Speaking motion trigger
    useEffect(() => {
        if (!modelLoaded || !modelRef.current) return;

        const model = modelRef.current;

        if (agentState === 'speaking' && !isSpeakingMotionRef.current) {
            isSpeakingMotionRef.current = true;
            try {
                const speakIndex = Math.floor(Math.random() * 2);
                model.motion('Speak', speakIndex, MotionPriority.NORMAL);
                console.log('Playing speak motion');
            } catch (err) {
                console.warn('Could not play speak motion:', err);
            }
        } else if (agentState !== 'speaking' && isSpeakingMotionRef.current) {
            isSpeakingMotionRef.current = false;
            try {
                const idleIndex = Math.floor(Math.random() * 3);
                model.motion('Idle', idleIndex, MotionPriority.IDLE);
                console.log('Returning to idle motion');
            } catch (err) {
                console.warn('Could not return to idle:', err);
            }
        }
    }, [agentState, modelLoaded]);

    // NEW: Handle action commands (Wave, Nod, Wink, WagTail)
    useEffect(() => {
        if (!modelLoaded || !action) return;

        const model = modelRef.current;
        if (!model) return;

        // Map action names to motion groups
        const actionMotionMap: Record<string, string> = {
            'wave': 'Wave',
            'nod': 'Nod',
            'wink': 'Wink',
            'wagtail': 'WagTail',
            'Wave': 'Wave',
            'Nod': 'Nod',
            'Wink': 'Wink',
            'WagTail': 'WagTail',
        };

        const motionGroup = actionMotionMap[action];
        if (motionGroup) {
            try {
                model.motion(motionGroup, 0, MotionPriority.FORCE);
                console.log(`Playing action motion: ${motionGroup}`);
            } catch (err) {
                console.warn(`Could not play action motion ${motionGroup}:`, err);
            }
        }
    }, [action, modelLoaded]);

    // Main animation loop with all enhancements
    useEffect(() => {
        if (!isConnected || !modelLoaded) return;

        const updateAnimations = () => {
            const model = modelRef.current;
            if (!model?.internalModel?.coreModel) {
                animationFrameRef.current = requestAnimationFrame(updateAnimations);
                return;
            }

            const coreModel = model.internalModel.coreModel;
            const now = performance.now();
            const deltaTime = (now - lastTimeRef.current) / 1000; // seconds
            lastTimeRef.current = now;

            try {
                // === 1. BREATHING ANIMATION ===
                breathingPhaseRef.current += deltaTime * 0.8; // Slow breathing
                const breathValue = Math.sin(breathingPhaseRef.current) * 0.5 + 0.5;
                if (coreModel.setParameterValueById) {
                    coreModel.setParameterValueById('ParamBreath', breathValue);
                }

                // === 2. FFT-BASED LIP-SYNC (Wawa-style) ===
                let targetMouthOpen = 0;
                let targetMouthForm = 0;

                if (agentState === 'speaking') {
                    if (frequencyData) {
                        // Use FFT frequency bands for realistic mouth shapes
                        const { low, mid, high } = frequencyData;

                        // Mouth opening: driven by low + mid frequencies
                        // Low freqs (O, U): wide open, round mouth
                        // Mid freqs (A, E): open but flatter
                        targetMouthOpen = Math.min(1, (low * 1.2 + mid * 0.8));

                        // Mouth form: -1 = pucker (O, U), +1 = smile (I, E)
                        // Low frequencies → pucker (negative)
                        // Mid/High frequencies → smile/spread (positive)
                        targetMouthForm = (mid * 0.6 + high * 0.4) - (low * 0.5);
                        targetMouthForm = Math.max(-1, Math.min(1, targetMouthForm));

                        // Add subtle variation for consonants (high freq)
                        if (high > 0.3) {
                            // Quick mouth movements for S, T, F sounds
                            targetMouthOpen *= (0.7 + high * 0.3);
                        }
                    } else {
                        // Fallback to volume-based (legacy)
                        targetMouthOpen = Math.min(1, (volume / 70) * 1.3);
                        headSwayPhaseRef.current += deltaTime * 4;
                        targetMouthForm = Math.sin(headSwayPhaseRef.current * 1.5) * 0.3;
                    }
                }

                // Smooth transitions for natural movement
                const smoothing = 0.35; // Slightly faster for lip sync responsiveness
                smoothedVolumeRef.current += (targetMouthOpen - smoothedVolumeRef.current) * smoothing;

                if (coreModel.setParameterValueById) {
                    coreModel.setParameterValueById('ParamMouthOpenY', smoothedVolumeRef.current);
                    coreModel.setParameterValueById('ParamMouthForm', targetMouthForm);
                }

                // === 3. HEAD/BODY MOVEMENT DURING SPEECH ===
                if (agentState === 'speaking') {
                    // Subtle head movements synced with speech
                    const swayX = Math.sin(headSwayPhaseRef.current * 0.7) * 4; // Left-right
                    const swayZ = Math.sin(headSwayPhaseRef.current * 0.5) * 3; // Tilt
                    const bodySwayZ = Math.sin(headSwayPhaseRef.current * 0.3) * 2; // Body sway

                    if (coreModel.setParameterValueById) {
                        // Add to existing angle values (don't override completely)
                        coreModel.setParameterValueById('ParamAngleX', swayX);
                        coreModel.setParameterValueById('ParamAngleZ', swayZ);
                        coreModel.setParameterValueById('ParamBodyAngleZ', bodySwayZ);
                    }
                } else {
                    // Reset to neutral when not speaking
                    if (coreModel.setParameterValueById) {
                        // Smoothly return to center
                        const currentX = coreModel.getParameterValueById?.('ParamAngleX') || 0;
                        const currentZ = coreModel.getParameterValueById?.('ParamAngleZ') || 0;
                        coreModel.setParameterValueById('ParamAngleX', currentX * 0.95);
                        coreModel.setParameterValueById('ParamAngleZ', currentZ * 0.95);
                        coreModel.setParameterValueById('ParamBodyAngleZ', 0);
                    }
                }

                // === 4. RANDOM EYE BLINKS ===
                if (blinkProgressRef.current < 0) {
                    // Not blinking - check if it's time to blink
                    if (now >= nextBlinkTimeRef.current) {
                        blinkProgressRef.current = 0; // Start blink
                        nextBlinkTimeRef.current = now + 3000 + Math.random() * 4000; // Next blink in 3-7 seconds
                    }
                } else {
                    // Currently blinking
                    blinkProgressRef.current += deltaTime * 8; // Blink duration ~0.25 seconds

                    let eyeOpen = 1;
                    if (blinkProgressRef.current < 0.5) {
                        // Closing eyes
                        eyeOpen = 1 - (blinkProgressRef.current * 2);
                    } else if (blinkProgressRef.current < 1) {
                        // Opening eyes
                        eyeOpen = (blinkProgressRef.current - 0.5) * 2;
                    } else {
                        // Blink complete
                        blinkProgressRef.current = -1;
                        eyeOpen = 1;
                    }

                    if (coreModel.setParameterValueById) {
                        coreModel.setParameterValueById('ParamEyeLOpen', eyeOpen);
                        coreModel.setParameterValueById('ParamEyeROpen', eyeOpen);
                    }
                }

            } catch (err) {
                // Silently handle parameter errors
            }

            animationFrameRef.current = requestAnimationFrame(updateAnimations);
        };

        animationFrameRef.current = requestAnimationFrame(updateAnimations);

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

            {/* Decorative glow that responds to agent state */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div
                    className={`w-96 h-96 rounded-full blur-3xl transition-all duration-500 ${agentState === 'speaking'
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
                        className={`w-2 h-2 rounded-full ${agentState === 'speaking'
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
