# How to Integrate Live2D Avatar in React + Vite Project

## Overview

This document explains how to integrate a Live2D Cubism 4 avatar (specifically the Huohuo model) into a React + Vite + TypeScript project. This guide is written for AI agents to avoid the many compatibility pitfalls encountered during integration.

---

## ⚠️ CRITICAL VERSION REQUIREMENTS

The biggest challenge is **version compatibility** between packages. Use these EXACT versions:

```json
{
  "pixi.js": "^7.4.2",
  "pixi-live2d-display": "^0.5.0-beta",
  "@pixi/core": "7.4.2",
  "@pixi/display": "7.4.2",
  "@pixi/constants": "7.4.2",
  "@pixi/math": "7.4.2",
  "@pixi/runner": "7.4.2",
  "@pixi/settings": "7.4.2",
  "@pixi/ticker": "7.4.2",
  "@pixi/utils": "7.4.2"
}
```

### Why These Specific Versions?

| Package | Version | Reason |
|---------|---------|--------|
| `pixi.js` | 7.4.2 | v8.x has breaking API changes (`updateLocalTransform` removed) |
| `pixi-live2d-display` | 0.5.0-beta | Only version that supports PixiJS v7. v0.4.0 requires v6 |
| `@pixi/*` packages | 7.4.2 | Required because `pixi-live2d-display` imports individual packages |

---

## Step 1: Install Dependencies

```bash
# Install main packages
npm install pixi.js@7.4.2 pixi-live2d-display@0.5.0-beta

# Install individual @pixi packages (REQUIRED - pixi-live2d-display imports these directly)
npm install @pixi/core@7.4.2 @pixi/display@7.4.2 @pixi/constants@7.4.2 @pixi/math@7.4.2 @pixi/runner@7.4.2 @pixi/settings@7.4.2 @pixi/ticker@7.4.2 @pixi/utils@7.4.2
```

---

## Step 2: Download Live2D Cubism SDK Core

The Cubism SDK Core is required but cannot be distributed via npm due to licensing.

1. Download from: https://cubism.live2d.com/sdk-web/cubismcore/live2dcubismcore.min.js
2. Save to: `public/lib/live2dcubismcore.min.js`

Alternative CDN (for development):
```
https://cubism.live2d.com/sdk-web/cubismcore/live2dcubismcore.min.js
```

---

## Step 3: Add Cubism SDK to HTML

Add this script tag to `index.html` BEFORE your app bundle:

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <!-- ... other head content ... -->
  </head>
  <body>
    <div id="root"></div>
    
    <!-- CRITICAL: Load Cubism SDK BEFORE your app -->
    <script src="/lib/live2dcubismcore.min.js"></script>
    
    <script type="module" src="/index.tsx"></script>
  </body>
</html>
```

---

## Step 4: Configure Vite (if using Vite)

No special Vite configuration is required if you installed all `@pixi/*` packages. 

**DO NOT** try to alias `@pixi/core` to `pixi.js` - it doesn't work because the export structures are different.

---

## Step 5: Prepare Your Live2D Model

### Required Files Structure
```
public/models/your-model/
├── model-name.model3.json    # Main model definition
├── model-name.moc3           # Model binary
├── model-name.physics3.json  # Physics simulation
├── textures/                 # Texture files
│   ├── texture_00.png
│   └── ...
├── motions/                  # Motion files (optional)
│   ├── idle.motion3.json
│   └── ...
└── expressions/              # Expression files (optional)
    ├── happy.exp3.json
    └── ...
```

### Configure model3.json for Motions and Expressions

The `.model3.json` file MUST include motion and expression definitions. If your model doesn't have them, add them:

```json
{
  "Version": 3,
  "FileReferences": {
    "Moc": "model.moc3",
    "Textures": ["textures/texture_00.png"],
    "Physics": "model.physics3.json",
    "Expressions": [
      { "Name": "happy", "File": "happy.exp3.json" },
      { "Name": "sad", "File": "sad.exp3.json" }
    ],
    "Motions": {
      "Idle": [
        { "File": "idle1.motion3.json", "FadeInTime": 0.5, "FadeOutTime": 0.5 },
        { "File": "idle2.motion3.json", "FadeInTime": 0.5, "FadeOutTime": 0.5 }
      ],
      "TapBody": [
        { "File": "reaction.motion3.json", "FadeInTime": 0.3, "FadeOutTime": 0.3 }
      ],
      "Speak": [
        { "File": "talk.motion3.json", "FadeInTime": 0.3, "FadeOutTime": 0.3 }
      ]
    }
  },
  "Groups": [
    { "Target": "Parameter", "Name": "EyeBlink", "Ids": [] },
    { "Target": "Parameter", "Name": "LipSync", "Ids": [] }
  ]
}
```

---

## Step 6: Create the Avatar Component

Here's the complete, working React component:

```tsx
import React, { useEffect, useRef, useState } from 'react';
import * as PIXI from 'pixi.js';

// CRITICAL: Expose PIXI to window BEFORE importing Live2DModel
if (typeof window !== 'undefined') {
    (window as any).PIXI = PIXI;
}

// Import AFTER PIXI is exposed to window
import { Live2DModel, MotionPriority } from 'pixi-live2d-display/cubism4';

interface AvatarCanvasProps {
    volume: number;           // Audio volume 0-100 for lip sync
    isConnected: boolean;     // Whether connected to voice
    agentState: 'disconnected' | 'connecting' | 'listening' | 'thinking' | 'speaking';
}

const AvatarCanvas: React.FC<AvatarCanvasProps> = ({ volume, isConnected, agentState }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const appRef = useRef<PIXI.Application | null>(null);
    const modelRef = useRef<any>(null);
    const mountIdRef = useRef<number>(0);
    const [modelLoaded, setModelLoaded] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const smoothedVolumeRef = useRef<number>(0);
    const animationFrameRef = useRef<number | null>(null);
    const isSpeakingMotionRef = useRef(false);

    // Initialize PIXI and load model
    useEffect(() => {
        if (!containerRef.current) return;

        const currentMountId = ++mountIdRef.current;
        
        // Delay to ensure container has dimensions
        const initTimer = setTimeout(() => {
            if (!containerRef.current) return;
            if (currentMountId !== mountIdRef.current) return;
            
            const container = containerRef.current;
            const width = container.clientWidth || window.innerWidth || 800;
            const height = container.clientHeight || window.innerHeight || 600;
            
            console.log(`Canvas dimensions: ${width}x${height}`);

            // Create canvas
            const canvas = document.createElement('canvas');
            canvas.style.position = 'absolute';
            canvas.style.top = '0';
            canvas.style.left = '0';
            canvas.style.width = '100%';
            canvas.style.height = '100%';
            container.appendChild(canvas);

            // Initialize PIXI
            const app = new PIXI.Application({
                view: canvas,
                width,
                height,
                backgroundAlpha: 0,
                resolution: window.devicePixelRatio || 1,
                autoDensity: true,
            });

            appRef.current = app;

            // Load model
            const modelPath = '/models/huohuo/huohuo.model3.json';

            Live2DModel.from(modelPath).then((model) => {
                if (currentMountId !== mountIdRef.current) {
                    model.destroy();
                    return;
                }

                if (!appRef.current?.stage) {
                    model.destroy();
                    return;
                }

                modelRef.current = model;
                const modelAny = model as any;

                // Scale to fit
                const modelWidth = modelAny.width || 800;
                const modelHeight = modelAny.height || 600;
                const targetHeight = height * 0.85;
                const scale = targetHeight / modelHeight;

                modelAny.scale.set(scale);
                modelAny.anchor.set(0.5, 0.5);
                modelAny.position.set(width / 2, height * 0.55);

                app.stage.addChild(model as unknown as PIXI.DisplayObject);

                // Start idle motion
                try {
                    model.motion('Idle', 0, MotionPriority.IDLE);
                    
                    model.on('motionFinish', (group: string) => {
                        if (group === 'Idle') {
                            const randomIndex = Math.floor(Math.random() * 3);
                            model.motion('Idle', randomIndex, MotionPriority.IDLE);
                        }
                    });
                } catch (err) {
                    console.warn('Could not start idle motion:', err);
                }

                // Mouse tracking
                const onMouseMove = (e: MouseEvent) => {
                    if (!modelRef.current) return;
                    const rect = container.getBoundingClientRect();
                    modelRef.current.focus(e.clientX - rect.left, e.clientY - rect.top);
                };
                container.addEventListener('mousemove', onMouseMove);

                // Click reactions
                const onClick = () => {
                    if (!modelRef.current) return;
                    modelRef.current.motion('TapBody', Math.floor(Math.random() * 3));
                };
                container.addEventListener('click', onClick);

                setModelLoaded(true);
                setError(null);
                console.log('Live2D model loaded successfully!');

            }).catch((err) => {
                if (currentMountId !== mountIdRef.current) return;
                console.error('Failed to load Live2D model:', err);
                setError(err instanceof Error ? err.message : 'Failed to load avatar');
            });
            
        }, 100);

        // Cleanup
        return () => {
            clearTimeout(initTimer);
            if (animationFrameRef.current) {
                cancelAnimationFrame(animationFrameRef.current);
            }
            if (modelRef.current) {
                try { modelRef.current.destroy(); } catch {}
                modelRef.current = null;
            }
            if (appRef.current) {
                try { appRef.current.destroy(true, { children: true }); } catch {}
                appRef.current = null;
            }
            if (containerRef.current) {
                while (containerRef.current.firstChild) {
                    containerRef.current.removeChild(containerRef.current.firstChild);
                }
            }
            setModelLoaded(false);
        };
    }, []);

    // Speaking motion trigger
    useEffect(() => {
        if (!modelLoaded || !modelRef.current) return;

        const model = modelRef.current;
        
        if (agentState === 'speaking' && !isSpeakingMotionRef.current) {
            isSpeakingMotionRef.current = true;
            try {
                model.motion('Speak', Math.floor(Math.random() * 2), MotionPriority.NORMAL);
            } catch {}
        } else if (agentState !== 'speaking' && isSpeakingMotionRef.current) {
            isSpeakingMotionRef.current = false;
            try {
                model.motion('Idle', Math.floor(Math.random() * 3), MotionPriority.IDLE);
            } catch {}
        }
    }, [agentState, modelLoaded]);

    // Lip sync animation
    useEffect(() => {
        if (!isConnected || !modelLoaded) return;

        const updateLipSync = () => {
            if (!modelRef.current?.internalModel?.coreModel) {
                animationFrameRef.current = requestAnimationFrame(updateLipSync);
                return;
            }

            let targetVolume = agentState === 'speaking' ? Math.min(1, (volume / 80) * 1.2) : 0;
            smoothedVolumeRef.current += (targetVolume - smoothedVolumeRef.current) * 0.25;

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
            }
        };
    }, [isConnected, modelLoaded, volume, agentState]);

    return (
        <div className="relative w-full h-full flex items-center justify-center overflow-hidden bg-stone-950">
            <div className="absolute inset-0 bg-gradient-to-b from-teal-900/20 via-stone-950 to-stone-950" />
            
            <div
                ref={containerRef}
                className="absolute inset-0 z-10"
                style={{ touchAction: 'none' }}
            />

            {!modelLoaded && !error && (
                <div className="absolute inset-0 flex items-center justify-center z-20">
                    <span className="text-stone-400">Loading Avatar...</span>
                </div>
            )}

            {error && (
                <div className="absolute inset-0 flex items-center justify-center z-20">
                    <span className="text-red-400">Error: {error}</span>
                </div>
            )}

            {/* Status indicator */}
            <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-20">
                <div className="flex items-center gap-2 bg-stone-900/80 backdrop-blur-sm rounded-full px-4 py-2">
                    <span className={`w-2 h-2 rounded-full ${
                        agentState === 'speaking' ? 'bg-teal-400 animate-pulse' :
                        agentState === 'thinking' ? 'bg-amber-400 animate-pulse' :
                        agentState === 'listening' ? 'bg-emerald-400' : 'bg-stone-500'
                    }`} />
                    <span className="text-xs text-stone-400 uppercase tracking-wider">
                        {agentState === 'speaking' ? 'Speaking' :
                         agentState === 'thinking' ? 'Thinking' :
                         agentState === 'listening' ? 'Listening' : 'Ready'}
                    </span>
                </div>
            </div>
        </div>
    );
};

export default AvatarCanvas;
```

---

## Common Problems and Solutions

### Problem 1: "Could not find Cubism 2 runtime"

**Cause**: Importing from `pixi-live2d-display` instead of the Cubism 4 specific export.

**Solution**: Import from the cubism4 subpath:
```tsx
// ❌ WRONG
import { Live2DModel } from 'pixi-live2d-display';

// ✅ CORRECT
import { Live2DModel } from 'pixi-live2d-display/cubism4';
```

---

### Problem 2: "container.updateLocalTransform is not a function"

**Cause**: Using PixiJS v8 which has breaking API changes.

**Solution**: Downgrade to PixiJS v7.4.2:
```bash
npm install pixi.js@7.4.2
```

---

### Problem 3: "Could not resolve @pixi/core"

**Cause**: `pixi-live2d-display` imports individual `@pixi/*` packages, but you only installed the bundled `pixi.js`.

**Solution**: Install all individual packages:
```bash
npm install @pixi/core@7.4.2 @pixi/display@7.4.2 @pixi/constants@7.4.2 @pixi/math@7.4.2 @pixi/runner@7.4.2 @pixi/settings@7.4.2 @pixi/ticker@7.4.2 @pixi/utils@7.4.2
```

---

### Problem 4: "App destroyed before model finished loading" (React Strict Mode)

**Cause**: React Strict Mode mounts/unmounts components twice in development, causing race conditions.

**Solution**: Use a mount ID tracking pattern:
```tsx
const mountIdRef = useRef<number>(0);

useEffect(() => {
    const currentMountId = ++mountIdRef.current;
    
    Live2DModel.from(modelPath).then((model) => {
        // Check if this is still the current mount
        if (currentMountId !== mountIdRef.current) {
            model.destroy();
            return;
        }
        // ... continue with setup
    });
}, []);
```

---

### Problem 5: Model loads but is invisible

**Cause**: Container has zero dimensions when model is positioned.

**Solution**: 
1. Use `setTimeout` to delay initialization
2. Use window dimensions as fallback
```tsx
const initTimer = setTimeout(() => {
    const width = container.clientWidth || window.innerWidth || 800;
    const height = container.clientHeight || window.innerHeight || 600;
    // ... initialize
}, 100);
```

---

### Problem 6: PIXI not found by pixi-live2d-display

**Cause**: `pixi-live2d-display` expects PIXI to be on the window object.

**Solution**: Expose PIXI to window BEFORE importing Live2DModel:
```tsx
import * as PIXI from 'pixi.js';

// MUST be before importing Live2DModel
if (typeof window !== 'undefined') {
    (window as any).PIXI = PIXI;
}

// Now import
import { Live2DModel } from 'pixi-live2d-display/cubism4';
```

---

### Problem 7: Model not animating / No idle motion

**Cause**: Model's `.model3.json` doesn't have motions defined.

**Solution**: Edit the model3.json to include motion definitions (see Step 5).

---

### Problem 8: TypeScript errors on model.width, model.scale, etc.

**Cause**: `Live2DModel` types don't expose PIXI.Container properties.

**Solution**: Cast to `any`:
```tsx
const modelAny = model as any;
modelAny.scale.set(scale);
modelAny.position.set(x, y);
```

---

### Problem 9: Motion priority string errors

**Cause**: Using string priorities instead of enum.

**Solution**: Import and use `MotionPriority`:
```tsx
import { Live2DModel, MotionPriority } from 'pixi-live2d-display/cubism4';

// ❌ WRONG
model.motion('Idle', 0, 'IDLE');

// ✅ CORRECT
model.motion('Idle', 0, MotionPriority.IDLE);
```

---

## Package Version Compatibility Matrix

| pixi.js | pixi-live2d-display | Status |
|---------|---------------------|--------|
| 8.x | 0.5.0-beta | ❌ Broken - API changes |
| 7.x | 0.5.0-beta | ✅ Works |
| 7.x | 0.4.0 | ❌ Broken - requires v6 |
| 6.x | 0.4.0 | ✅ Works (older) |

---

## Summary Checklist

- [ ] Install `pixi.js@7.4.2` and `pixi-live2d-display@0.5.0-beta`
- [ ] Install all `@pixi/*` packages at version 7.4.2
- [ ] Download Cubism SDK to `public/lib/live2dcubismcore.min.js`
- [ ] Add script tag in `index.html` before app bundle
- [ ] Expose PIXI to window before importing Live2DModel
- [ ] Import from `pixi-live2d-display/cubism4`
- [ ] Configure model3.json with motions and expressions
- [ ] Handle React Strict Mode with mount ID tracking
- [ ] Use setTimeout for initialization to ensure container has dimensions

---

## Files Created/Modified

1. `public/lib/live2dcubismcore.min.js` - Cubism SDK
2. `index.html` - Added script tag
3. `components/AvatarCanvas.tsx` - Avatar component
4. `public/models/huohuo/huohuo.model3.json` - Model config with motions
5. `package.json` - Added all dependencies

---

*Document created: January 2026*
*Last tested with: pixi.js 7.4.2, pixi-live2d-display 0.5.0-beta, Vite 6.4.1, React 18*
