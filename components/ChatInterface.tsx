
import React, { useState, useRef, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Character, ChatSession, Message, BubbleStyle, BubbleTheme } from '../types';
import { CHARACTERS } from '../characters';
import { getChatResponse, generateCharacterImage, generateSpeech } from '../geminiService';
import VideoCallOverlay from './VideoCallOverlay';

interface ChatInterfaceProps {
  sessions: ChatSession[];
  onUpdateMessages: (sessionId: string, messages: Message[]) => void;
  onUpdateSessionData?: (sessionId: string, data: Partial<ChatSession>) => void;
}

const AVAILABLE_VOICES = [
  { id: 'Charon', name: 'Charon (Nam trầm)' },
  { id: 'Fenrir', name: 'Fenrir (Nam mạnh mẽ)' },
  { id: 'Puck', name: 'Puck (Nam dí dỏm)' },
  { id: 'Kore', name: 'Kore (Nữ trẻ trung)' },
  { id: 'Zephyr', name: 'Zephyr (Nữ thanh thoát)' },
];

const BUBBLE_STYLES: { id: BubbleStyle; name: string }[] = [
  { id: 'rounded', name: 'Bo tròn' },
  { id: 'sharp', name: 'Góc cạnh' },
  { id: 'pill', name: 'Viên thuốc' },
];

const BUBBLE_THEMES: { id: BubbleTheme; name: string; color: string }[] = [
  { id: 'classic', name: 'Cổ điển', color: 'bg-pink-600' },
  { id: 'ocean', name: 'Đại dương', color: 'bg-blue-600' },
  { id: 'emerald', name: 'Ngọc lục bảo', color: 'bg-emerald-600' },
  { id: 'sunset', name: 'Hoàng hôn', color: 'bg-orange-600' },
  { id: 'monochrome', name: 'Đơn sắc', color: 'bg-slate-600' },
];

// Audio utility functions
function decodeBase64(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

const ChatInterface: React.FC<ChatInterfaceProps> = ({ sessions, onUpdateMessages, onUpdateSessionData }) => {
  const { sessionId } = useParams<{ sessionId: string }>();
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [playingMessageId, setPlayingMessageId] = useState<string | null>(null);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [showThemePanel, setShowThemePanel] = useState(false);
  const [isVideoCalling, setIsVideoCalling] = useState(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const currentSourceRef = useRef<AudioBufferSourceNode | null>(null);

  const session = sessions.find(s => s.id === sessionId);
  const character = CHARACTERS.find(c => c.id === session?.characterId);

  const isSpicy = session?.isSpicy || false;
  const currentVoice = session?.voiceOverride || character?.voice || 'Kore';
  const currentBubbleStyle = session?.bubbleStyle || 'rounded';
  const currentBubbleTheme = session?.bubbleTheme || 'classic';

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [session?.messages, isGeneratingImage, isLoading]);

  useEffect(() => {
    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSelectedImage(null);
        setShowThemePanel(false);
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, []);

  // Initialize Speech Recognition
  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = false;
      recognitionRef.current.lang = 'vi-VN'; 

      recognitionRef.current.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        setInput(prev => prev + (prev ? ' ' : '') + transcript);
        setIsListening(false);
      };

      recognitionRef.current.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error);
        setIsListening(false);
      };

      recognitionRef.current.onend = () => {
        setIsListening(false);
      };
    }

    return () => {
      if (currentSourceRef.current) {
        currentSourceRef.current.stop();
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);

  if (!session || !character) {
    return (
      <div className="flex items-center justify-center h-full text-slate-500">
        Không tìm thấy cuộc trò chuyện.
      </div>
    );
  }

  const toggleSpicy = () => {
    if (onUpdateSessionData) {
      onUpdateSessionData(session.id, { isSpicy: !isSpicy });
    }
  };

  const handleVoiceChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    if (onUpdateSessionData) {
      onUpdateSessionData(session.id, { voiceOverride: e.target.value });
    }
  };

  const handleUpdateTheme = (updates: Partial<ChatSession>) => {
    if (onUpdateSessionData) {
      onUpdateSessionData(session.id, updates);
    }
  };

  const toggleListening = () => {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
    } else {
      try {
        recognitionRef.current?.start();
        setIsListening(true);
      } catch (err) {
        console.error('Failed to start speech recognition:', err);
      }
    }
  };

  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: `user_${Date.now()}`,
      role: 'user',
      content: input,
      timestamp: Date.now()
    };

    const newHistory = [...session.messages, userMessage];
    onUpdateMessages(session.id, newHistory);
    setInput('');
    setIsLoading(true);

    try {
      const responseText = await getChatResponse(character, newHistory, isSpicy);
      const modelMessage: Message = {
        id: `model_${Date.now()}`,
        role: 'model',
        content: responseText,
        timestamp: Date.now()
      };
      onUpdateMessages(session.id, [...newHistory, modelMessage]);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGenerateImage = async () => {
    if (isGeneratingImage) return;
    setIsGeneratingImage(true);
    try {
      const lastContext = session.messages[session.messages.length - 1]?.content || "";
      const prompt = `A situational scene involving ${character.name}, ${character.tagline}. Current conversation context: ${lastContext.substring(0, 100)}`;
      
      const imageUrl = await generateCharacterImage(prompt, isSpicy);
      if (imageUrl) {
        const imageMessage: Message = {
          id: `img_${Date.now()}`,
          role: 'model',
          content: isSpicy ? `${character.name} đã gửi một bức ảnh thật tình tứ...` : `${character.name} đã gửi một bức ảnh!`,
          timestamp: Date.now(),
          image: imageUrl
        };
        onUpdateMessages(session.id, [...session.messages, imageMessage]);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsGeneratingImage(false);
    }
  };

  const handlePlayAudio = async (msg: Message) => {
    if (playingMessageId === msg.id) {
      currentSourceRef.current?.stop();
      setPlayingMessageId(null);
      return;
    }

    if (currentSourceRef.current) {
      currentSourceRef.current.stop();
    }

    setPlayingMessageId(msg.id);

    try {
      const base64Audio = await generateSpeech(msg.content, currentVoice);
      if (!base64Audio) {
        setPlayingMessageId(null);
        return;
      }

      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      }
      
      const ctx = audioContextRef.current;
      const audioBytes = decodeBase64(base64Audio);
      const audioBuffer = await decodeAudioData(audioBytes, ctx, 24000, 1);
      
      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(ctx.destination);
      source.onended = () => {
        if (playingMessageId === msg.id) {
          setPlayingMessageId(null);
        }
      };
      
      currentSourceRef.current = source;
      source.start();
    } catch (error) {
      console.error("Audio playback error:", error);
      setPlayingMessageId(null);
    }
  };

  // Helper to get bubble classes
  const getBubbleClasses = (role: 'user' | 'model') => {
    let classes = 'px-4 py-3 text-sm leading-relaxed shadow-sm transition-all duration-500 ';
    
    // Style
    if (currentBubbleStyle === 'rounded') {
      classes += role === 'user' ? 'rounded-2xl rounded-tr-none ' : 'rounded-2xl rounded-tl-none ';
    } else if (currentBubbleStyle === 'sharp') {
      classes += role === 'user' ? 'rounded-md rounded-tr-none ' : 'rounded-md rounded-tl-none ';
    } else if (currentBubbleStyle === 'pill') {
      classes += 'rounded-3xl ';
    }

    // Spicy has priority
    if (isSpicy) {
      classes += role === 'user' 
        ? 'bg-rose-600 text-white ' 
        : 'bg-rose-900/40 text-rose-100 border border-rose-700/50 shadow-[0_0_10px_rgba(159,18,57,0.2)] ';
      return classes;
    }

    // Theme (User)
    if (role === 'user') {
      switch (currentBubbleTheme) {
        case 'ocean': classes += 'bg-blue-600 text-white '; break;
        case 'emerald': classes += 'bg-emerald-600 text-white '; break;
        case 'sunset': classes += 'bg-orange-600 text-white '; break;
        case 'monochrome': classes += 'bg-slate-700 text-slate-100 '; break;
        default: classes += 'bg-pink-600 text-white '; break;
      }
    } else {
      // Model
      switch (currentBubbleTheme) {
        case 'ocean': classes += 'bg-slate-800 text-blue-100 border border-blue-900/50 '; break;
        case 'emerald': classes += 'bg-slate-800 text-emerald-100 border border-emerald-900/50 '; break;
        case 'sunset': classes += 'bg-slate-800 text-orange-100 border border-orange-900/50 '; break;
        case 'monochrome': classes += 'bg-slate-800 text-slate-300 border border-slate-700 '; break;
        default: classes += 'bg-slate-800 text-slate-200 border border-slate-700 '; break;
      }
    }

    return classes;
  };

  return (
    <div className={`flex flex-col h-full transition-colors duration-1000 ${isSpicy ? 'bg-rose-950/40' : 'bg-slate-900'}`}>
      {/* Video Call Overlay */}
      {isVideoCalling && (
        <VideoCallOverlay 
          character={character} 
          onClose={() => setIsVideoCalling(false)} 
          isSpicy={isSpicy}
        />
      )}

      {/* Background Glow Effect for Spicy Mode */}
      {isSpicy && (
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-rose-500/10 rounded-full blur-[128px] animate-pulse"></div>
          <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-[128px] animate-pulse delay-1000"></div>
        </div>
      )}

      {/* Image Modal Overlay */}
      {selectedImage && (
        <div 
          className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-sm flex items-center justify-center p-4 md:p-10 cursor-zoom-out"
          onClick={() => setSelectedImage(null)}
        >
          <div className="relative max-w-5xl w-full h-full flex items-center justify-center">
            <img 
              src={selectedImage} 
              alt="Enlarged" 
              className="max-w-full max-h-full object-contain rounded-lg shadow-2xl animate-in zoom-in duration-300" 
              onClick={(e) => e.stopPropagation()}
            />
            <button 
              className="absolute top-0 right-0 m-4 p-2 bg-white/10 hover:bg-white/20 text-white rounded-full transition-colors backdrop-blur-md border border-white/20"
              onClick={() => setSelectedImage(null)}
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <div className={`px-6 py-4 border-b backdrop-blur-md flex items-center gap-4 sticky top-0 z-10 transition-colors duration-500 ${isSpicy ? 'bg-rose-900/30 border-rose-800/50' : 'bg-slate-800/50 border-slate-700'}`}>
        <div className="relative">
          <img 
            src={character.avatar} 
            alt={character.name} 
            className={`w-12 h-12 rounded-full border-2 object-cover transition-all duration-500 ${isSpicy ? 'border-rose-400 shadow-[0_0_15px_rgba(251,113,133,0.5)] scale-105' : 'border-pink-500'}`} 
          />
          {isSpicy && (
            <div className="absolute -bottom-1 -right-1 bg-rose-500 rounded-full p-1 animate-bounce">
              <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
              </svg>
            </div>
          )}
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3">
            <h2 className={`text-xl font-bold transition-colors truncate ${isSpicy ? 'text-rose-200' : 'text-white'}`}>{character.name}</h2>
            <select 
              value={currentVoice}
              onChange={handleVoiceChange}
              className={`text-[10px] font-bold uppercase tracking-wider rounded-lg px-2 py-1 outline-none transition-colors border cursor-pointer ${
                isSpicy 
                  ? 'bg-rose-900/40 border-rose-700/50 text-rose-300' 
                  : 'bg-slate-700 border-slate-600 text-slate-300 hover:border-pink-500'
              }`}
            >
              {AVAILABLE_VOICES.map(v => (
                <option key={v.id} value={v.id} className="bg-slate-900">{v.name}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full animate-pulse ${isSpicy ? 'bg-rose-400' : 'bg-green-500'}`}></span>
            <span className="text-xs text-slate-400 font-medium">{isSpicy ? 'Đang rất gần bạn...' : 'Trực tuyến'}</span>
          </div>
        </div>

        <div className="flex items-center gap-2 relative">
          {/* Video Call Button */}
          <button
            onClick={() => setIsVideoCalling(true)}
            className={`p-2.5 rounded-full transition-all duration-300 ${
              isSpicy ? 'bg-rose-900/50 text-rose-300 hover:bg-rose-800' : 'bg-slate-700 text-slate-400 hover:text-pink-500 hover:bg-slate-800'
            }`}
            title="Cuộc gọi video"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </button>

          {/* Customization Button */}
          <button
            onClick={() => setShowThemePanel(!showThemePanel)}
            className={`p-2.5 rounded-full transition-all duration-300 ${
              showThemePanel ? 'bg-pink-600 text-white' : 'bg-slate-700 text-slate-400 hover:text-pink-500'
            }`}
            title="Tùy chỉnh giao diện"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
            </svg>
          </button>

          {/* Theme/Style Panel */}
          {showThemePanel && (
            <div className="absolute right-0 top-full mt-2 w-64 bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl p-4 z-50 animate-in fade-in slide-in-from-top-2 duration-200">
              <div className="mb-4">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">Hình dáng bong bóng</p>
                <div className="grid grid-cols-3 gap-2">
                  {BUBBLE_STYLES.map(style => (
                    <button
                      key={style.id}
                      onClick={() => handleUpdateTheme({ bubbleStyle: style.id })}
                      className={`px-2 py-2 text-[10px] font-bold rounded-lg transition-all border ${
                        currentBubbleStyle === style.id 
                          ? 'bg-pink-600 border-pink-500 text-white' 
                          : 'bg-slate-700 border-slate-600 text-slate-400 hover:border-slate-500'
                      }`}
                    >
                      {style.name}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">Chủ đề màu sắc</p>
                <div className="space-y-2">
                  {BUBBLE_THEMES.map(theme => (
                    <button
                      key={theme.id}
                      onClick={() => handleUpdateTheme({ bubbleTheme: theme.id })}
                      className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl transition-all border ${
                        currentBubbleTheme === theme.id 
                          ? 'bg-slate-700 border-pink-500/50' 
                          : 'bg-slate-900/50 border-transparent hover:bg-slate-700'
                      }`}
                    >
                      <div className={`w-4 h-4 rounded-full ${theme.color}`}></div>
                      <span className={`text-xs font-medium ${currentBubbleTheme === theme.id ? 'text-pink-400' : 'text-slate-300'}`}>{theme.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Spicy Toggle Button */}
          <button
            onClick={toggleSpicy}
            className={`p-2.5 rounded-full transition-all duration-500 group relative ${
              isSpicy 
                ? 'bg-rose-500 text-white shadow-[0_0_15px_rgba(244,63,94,0.6)]' 
                : 'bg-slate-700 text-slate-400 hover:text-rose-400'
            }`}
            title={isSpicy ? "Tắt chế độ thân mật" : "Bật chế độ thân mật"}
          >
            <svg className={`w-6 h-6 transition-transform duration-500 ${isSpicy ? 'scale-110' : 'group-hover:scale-110'}`} fill={isSpicy ? "currentColor" : "none"} stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
            </svg>
            {isSpicy && (
              <span className="absolute -top-1 -right-1 flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-rose-500"></span>
              </span>
            )}
          </button>

          <button 
            onClick={handleGenerateImage}
            disabled={isGeneratingImage}
            className={`p-2.5 transition-all duration-300 rounded-full ${
              isGeneratingImage ? 'bg-pink-500/20 text-pink-500 scale-110' : 'text-slate-400 hover:text-pink-500 hover:bg-slate-700/50'
            }`}
            title="Yêu cầu gửi ảnh"
          >
            {isGeneratingImage ? (
               <svg className="animate-spin h-6 w-6" viewBox="0 0 24 24">
                 <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle>
                 <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
               </svg>
            ) : (
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Message Area */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6 relative z-0">
        {session.messages.map((msg) => (
          <div 
            key={msg.id} 
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div className={`max-w-[85%] md:max-w-[70%] flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
              {msg.role === 'model' && (
                <img src={character.avatar} alt={character.name} className={`w-8 h-8 rounded-full border flex-shrink-0 mt-1 object-cover ${isSpicy ? 'border-rose-400/50' : 'border-slate-700'}`} />
              )}
              <div className="flex flex-col gap-2 relative group">
                <div className={getBubbleClasses(msg.role)}>
                  {msg.content}
                </div>
                {msg.image && (
                  <div 
                    className={`rounded-2xl overflow-hidden border shadow-xl max-w-sm group relative transition-all duration-500 cursor-zoom-in hover:scale-[1.02] ${isSpicy ? 'border-rose-700/50 shadow-rose-950/20' : 'border-slate-700'}`}
                    onClick={() => setSelectedImage(msg.image || null)}
                  >
                    <img src={msg.image} alt="Generated" className="w-full h-auto" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-4">
                       <div className="flex items-center gap-2">
                         <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                           <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
                         </svg>
                         <p className="text-white text-xs font-bold uppercase tracking-wider">{isSpicy ? `Khoảnh khắc bí mật` : `Ảnh từ ${character.name}`}</p>
                       </div>
                    </div>
                  </div>
                )}
                <div className="flex items-center gap-3">
                  <span className="text-[10px] text-slate-500 uppercase font-bold tracking-widest px-1">
                    {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  {msg.role === 'model' && !msg.image && (
                    <button 
                      onClick={() => handlePlayAudio(msg)}
                      className={`p-1.5 rounded-full transition-all duration-200 ${
                        playingMessageId === msg.id 
                          ? 'bg-rose-500 text-white animate-pulse' 
                          : (isSpicy ? 'text-rose-400 hover:text-rose-300 hover:bg-rose-900/30' : 'text-slate-500 hover:text-pink-500 hover:bg-slate-800')
                      }`}
                      title={playingMessageId === msg.id ? "Dừng giọng nói" : "Nghe tin nhắn"}
                    >
                      {playingMessageId === msg.id ? (
                        <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                          <rect x="6" y="4" width="4" height="16" />
                          <rect x="14" y="4" width="4" height="16" />
                        </svg>
                      ) : (
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                        </svg>
                      )}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}

        {/* Image Generation Skeleton */}
        {isGeneratingImage && (
          <div className="flex justify-start gap-3">
            <img src={character.avatar} alt={character.name} className={`w-8 h-8 rounded-full border flex-shrink-0 mt-1 object-cover ${isSpicy ? 'border-rose-400/50' : 'border-slate-700'}`} />
            <div className="flex flex-col gap-2 w-full max-w-sm">
              <div className={`border px-4 py-3 rounded-2xl rounded-tl-none flex items-center gap-3 transition-colors ${isSpicy ? 'bg-rose-900/30 border-rose-700/50' : 'bg-slate-800 border-slate-700'}`}>
                <div className={`w-4 h-4 rounded-full border-2 border-t-transparent animate-spin ${isSpicy ? 'border-rose-400' : 'border-pink-500'}`}></div>
                <span className={`text-sm font-medium italic ${isSpicy ? 'text-rose-200' : 'text-slate-300'}`}>
                  {isSpicy ? "Đang chuẩn bị một khoảnh khắc thật đặc biệt..." : "Đang ghi lại khoảnh khắc cho bạn..."}
                </span>
              </div>
              <div className={`aspect-square w-full rounded-2xl border bg-slate-800 relative overflow-hidden shadow-2xl transition-colors ${isSpicy ? 'border-rose-700/50' : 'border-slate-700/50'}`}>
                <div className={`absolute inset-0 bg-gradient-to-br from-transparent via-transparent to-transparent animate-pulse ${isSpicy ? 'from-rose-500/20 via-rose-900/10' : 'from-pink-500/20 via-purple-500/10'}`}></div>
                <div className="absolute inset-0 flex items-center justify-center">
                   <div className="w-full h-full opacity-10 pointer-events-none bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')]"></div>
                   <div className="text-center p-6 space-y-4 w-full">
                      <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto ring-4 animate-bounce ${isSpicy ? 'bg-rose-500/20 ring-rose-500/10' : 'bg-pink-500/20 ring-pink-500/10'}`}>
                         <svg className={`w-8 h-8 ${isSpicy ? 'text-rose-400' : 'text-pink-500'}`} fill="currentColor" viewBox="0 0 24 24">
                           <path d="M4 4h16v16H4V4zm2 2v12h12V6H6zm3 3h6v6H9V9z" />
                         </svg>
                      </div>
                      <div className="h-1.5 w-48 bg-slate-700 rounded-full mx-auto overflow-hidden">
                        <div className={`h-full w-1/3 animate-[shimmer_1.5s_infinite] transition-all duration-300 ${isSpicy ? 'bg-gradient-to-r from-rose-500 to-rose-400 shadow-[0_0_10px_rgba(244,63,94,0.5)]' : 'bg-gradient-to-r from-pink-500 to-purple-500 shadow-[0_0_10px_rgba(236,72,153,0.5)]'}`}></div>
                      </div>
                      <p className={`text-[10px] uppercase font-black tracking-[0.2em] animate-pulse ${isSpicy ? 'text-rose-400' : 'text-pink-500'}`}>
                        {isSpicy ? "Gợi mở cảm xúc..." : "Đang xử lý thực tại..."}
                      </p>
                   </div>
                </div>
                <div className={`absolute -top-10 -left-10 w-32 h-32 rounded-full blur-3xl animate-pulse ${isSpicy ? 'bg-rose-500/10' : 'bg-pink-500/10'}`}></div>
                <div className={`absolute -bottom-10 -right-10 w-32 h-32 rounded-full blur-3xl animate-pulse delay-700 ${isSpicy ? 'bg-rose-500/10' : 'bg-purple-500/10'}`}></div>
              </div>
            </div>
          </div>
        )}

        {isLoading && !isGeneratingImage && (
          <div className="flex justify-start gap-3">
             <img src={character.avatar} alt={character.name} className={`w-8 h-8 rounded-full border object-cover ${isSpicy ? 'border-rose-400/50' : 'border-slate-700'}`} />
             <div className={`border px-4 py-3 rounded-2xl rounded-tl-none flex gap-1 items-center transition-colors ${isSpicy ? 'bg-rose-900/30 border-rose-700/50' : 'bg-slate-800 border-slate-700'}`}>
                <div className={`w-1.5 h-1.5 rounded-full animate-bounce ${isSpicy ? 'bg-rose-400' : 'bg-pink-500'}`}></div>
                <div className={`w-1.5 h-1.5 rounded-full animate-bounce delay-100 ${isSpicy ? 'bg-rose-400' : 'bg-pink-500'}`}></div>
                <div className={`w-1.5 h-1.5 rounded-full animate-bounce delay-200 ${isSpicy ? 'bg-rose-400' : 'bg-pink-500'}`}></div>
             </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className={`p-4 border-t backdrop-blur-md transition-colors duration-500 ${isSpicy ? 'bg-rose-900/30 border-rose-800/50' : 'bg-slate-800/50 border-slate-700'}`}>
        <form 
          onSubmit={handleSend}
          className="max-w-4xl mx-auto flex items-end gap-3"
        >
          <div className="flex-1 relative flex items-center gap-2">
            <div className="relative flex-1">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder={isSpicy ? `Nói lời ngọt ngào với ${character.name}...` : `Nhắn tin cho ${character.name}...`}
                className={`w-full text-slate-100 rounded-2xl px-4 py-3 focus:outline-none focus:ring-2 border resize-none min-h-[50px] max-h-32 transition-all ${
                  isSpicy 
                    ? 'bg-rose-950/60 border-rose-800 focus:ring-rose-500/50 placeholder:text-rose-300/30' 
                    : 'bg-slate-900 border-slate-700 focus:ring-pink-500/50'
                }`}
                rows={1}
              />
            </div>
            
            <button
              type="button"
              onClick={toggleListening}
              className={`p-3 rounded-xl transition-all shadow-lg active:scale-95 flex-shrink-0 relative overflow-hidden ${
                isListening 
                  ? 'bg-red-500 text-white animate-pulse ring-4 ring-red-500/20' 
                  : (isSpicy ? 'bg-rose-900/50 text-rose-300 hover:bg-rose-800' : 'bg-slate-700 text-slate-300 hover:bg-slate-600')
              }`}
              title={isListening ? "Ngừng nghe" : "Bắt đầu nhập bằng giọng nói"}
            >
              <svg className={`w-6 h-6 ${isListening ? 'animate-bounce' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-20a3 3 0 00-3 3v8a3 3 0 006 0V3a3 3 0 00-3-3z" />
              </svg>
            </button>
          </div>
          
          <button 
            type="submit"
            disabled={!input.trim() || isLoading}
            className={`p-3 text-white rounded-xl transition-all shadow-lg active:scale-95 flex-shrink-0 ${
              isSpicy 
                ? 'bg-rose-600 hover:bg-rose-700 disabled:bg-rose-900/50' 
                : 'bg-pink-600 hover:bg-pink-700 disabled:bg-slate-700'
            }`}
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </button>
        </form>
        <p className="text-[10px] text-center text-slate-500 mt-2">
          {isListening ? "Đang nghe... Hãy nói rõ ràng." : "Shift + Enter để xuống dòng. AI có thể tạo thông tin không chính xác."}
        </p>
      </div>

      <style>{`
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(300%); }
        }
        @keyframes zoom-in {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
        .animate-in {
          animation-name: zoom-in;
        }
      `}</style>
    </div>
  );
};

export default ChatInterface;
