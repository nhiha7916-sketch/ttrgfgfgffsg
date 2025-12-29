
export interface Character {
  id: string;
  name: string;
  avatar: string;
  tagline: string;
  description: string;
  persona: string;
  greeting: string;
  tags: string[];
  voice: string;
}

export interface Message {
  id: string;
  role: 'user' | 'model';
  content: string;
  timestamp: number;
  image?: string;
}

export type BubbleStyle = 'rounded' | 'sharp' | 'pill';
export type BubbleTheme = 'classic' | 'ocean' | 'emerald' | 'sunset' | 'monochrome';

export interface ChatSession {
  id: string;
  characterId: string;
  messages: Message[];
  lastUpdated: number;
  isSpicy?: boolean;
  voiceOverride?: string;
  bubbleStyle?: BubbleStyle;
  bubbleTheme?: BubbleTheme;
}
