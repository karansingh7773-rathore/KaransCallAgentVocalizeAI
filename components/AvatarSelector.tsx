import React from 'react';
import { AVATAR_MODELS, AvatarModel } from './avatarModels';

interface AvatarSelectorProps {
    currentModelId: string;
    onSelectModel: (modelId: string) => void;
    isOpen: boolean;
    onClose: () => void;
}

const AvatarSelector: React.FC<AvatarSelectorProps> = ({
    currentModelId,
    onSelectModel,
    isOpen,
    onClose
}) => {
    if (!isOpen) return null;

    const handleSelect = (model: AvatarModel) => {
        onSelectModel(model.id);
        // Save to localStorage for persistence
        localStorage.setItem('selectedAvatarId', model.id);
        onClose();
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="bg-stone-900 rounded-2xl p-6 max-w-lg w-full mx-4 border border-stone-700 shadow-2xl">
                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                    <h2 className="text-xl font-semibold text-white">Select Avatar</h2>
                    <button
                        onClick={onClose}
                        className="text-stone-400 hover:text-white transition-colors p-1"
                    >
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Avatar Grid */}
                <div className="grid grid-cols-2 gap-4">
                    {AVATAR_MODELS.map((model) => (
                        <button
                            key={model.id}
                            onClick={() => handleSelect(model)}
                            className={`relative p-4 rounded-xl border-2 transition-all duration-200 text-left ${currentModelId === model.id
                                ? 'border-teal-500 bg-teal-500/10'
                                : 'border-stone-700 bg-stone-800/50 hover:border-stone-500 hover:bg-stone-800'
                                }`}
                        >
                            {/* Selection indicator */}
                            {currentModelId === model.id && (
                                <div className="absolute top-2 right-2">
                                    <div className="w-6 h-6 bg-teal-500 rounded-full flex items-center justify-center">
                                        <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                        </svg>
                                    </div>
                                </div>
                            )}

                            {/* Avatar thumbnail */}
                            <div className={`w-20 h-20 rounded-xl mb-3 overflow-hidden border-2 ${currentModelId === model.id ? 'border-teal-500' : 'border-stone-600'
                                }`}>
                                <img
                                    src={model.thumbnail}
                                    alt={model.name}
                                    className="w-full h-full object-cover object-top"
                                />
                            </div>

                            {/* Model info */}
                            <h3 className="text-white font-medium mb-1">{model.name}</h3>
                            <p className="text-xs text-stone-400 line-clamp-2">{model.description}</p>

                            {/* Motion badge */}
                            {model.hasMotions && (
                                <span className="inline-block mt-2 px-2 py-0.5 text-xs bg-emerald-500/20 text-emerald-400 rounded-full">
                                    Animated
                                </span>
                            )}
                        </button>
                    ))}
                </div>

                {/* Footer hint */}
                <p className="mt-4 text-xs text-stone-500 text-center">
                    Your selection will be saved automatically
                </p>
            </div>
        </div>
    );
};

export default AvatarSelector;
