import React, { useMemo } from 'react';

interface AudioVisualizerProps {
    volume: number; // 0 to 255
    isConnected: boolean;
}

const AudioVisualizer: React.FC<AudioVisualizerProps> = ({ volume, isConnected }) => {
    // Normalize volume to 0-1 range
    const normalizedVolume = Math.min(volume / 100, 1);

    // Pre-generate random offsets once (not on every render)
    const barOffsets = useMemo(() =>
        Array.from({ length: 12 }, () => ({
            offset: Math.random() * 0.5 + 0.5, // 0.5 to 1.0
            baseHeight: 15 + Math.random() * 10,
        })),
        []);

    return (
        <div className="h-24 w-full max-w-md flex items-center justify-center gap-1.5">
            {barOffsets.map((bar, i) => {
                const activeHeight = isConnected
                    ? bar.baseHeight + (normalizedVolume * 80 * bar.offset)
                    : 5;
                const finalHeight = Math.min(activeHeight, 100);

                return (
                    <div
                        key={i}
                        className={`w-2 rounded-full transition-all duration-100 ease-out ${isConnected ? 'bg-rose-500/80' : 'bg-stone-700'
                            }`}
                        style={{
                            height: `${finalHeight}%`,
                            opacity: isConnected ? 0.7 + (normalizedVolume * 0.3) : 0.3,
                        }}
                    />
                );
            })}
        </div>
    );
};

export default React.memo(AudioVisualizer);
