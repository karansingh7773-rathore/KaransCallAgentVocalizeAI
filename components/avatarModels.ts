// Avatar Model Registry - Contains all available Live2D models

export interface AvatarModel {
    id: string;
    name: string;
    path: string;
    thumbnail: string;
    description: string;
    hasMotions: boolean;
}

export const AVATAR_MODELS: AvatarModel[] = [
    {
        id: 'huohuo',
        name: 'Huohuo',
        path: '/models/huohuo/huohuo.model3.json',
        thumbnail: '/houhou.png',
        description: 'Full animations with speaking motions',
        hasMotions: true
    },
    {
        id: 'changli',
        name: 'Nimshiha',
        path: '/models/Model1/长离.model3.json',
        thumbnail: '/nimsiha.png',
        description: 'Elegant design with expressions',
        hasMotions: false
    }
];

export const DEFAULT_MODEL_ID = 'huohuo';

export function getModelById(id: string): AvatarModel | undefined {
    return AVATAR_MODELS.find(m => m.id === id);
}

export function getModelPath(id: string): string {
    const model = getModelById(id);
    return model?.path || AVATAR_MODELS[0].path;
}
