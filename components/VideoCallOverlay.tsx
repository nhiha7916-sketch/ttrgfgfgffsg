
import React, { useEffect, useRef, useState } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { Character } from '../types';

interface VideoCallOverlayProps {
  character: Character;
  onClose: () => void;
  isSpicy: boolean;
}

// Audio Utilities as per Gemini Live API guidelines
function encode(bytes: Uint8Array) {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function decode(base64: string) {
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

const VideoCallOverlay: React.FC<VideoCallOverlayProps> = ({ character, onClose, isSpicy }) => {
  const [status, setStatus] = useState<'key_required' | 'connecting' | 'connected' | 'error'>('connecting');
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sessionRef = useRef<any>(null);
  const audioContextInRef = useRef<AudioContext | null>(null);
  const audioContextOutRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const frameIntervalRef = useRef<number | null>(null);

  const checkAndStartCall = async () => {
    // Check if key is selected (Mandatory for these high-tier preview models)
    if (window.aistudio && !(await window.aistudio.hasSelectedApiKey())) {
      setStatus('key_required');
      return;
    }
    startCall();
  };

  const handleOpenKeySelection = async () => {
    if (window.aistudio) {
      await window.aistudio.openSelectKey();
      // Proceed immediately as per race condition mitigation guidelines
      startCall();
    }
  };

  const startCall = async () => {
    let stream: MediaStream | null = null;
    setStatus('connecting');

    try {
      // Create fresh instance right before call
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

      stream = await navigator.mediaDevices.getUserMedia({ 
        audio: true, 
        video: { facingMode: 'user', width: 640, height: 480 } 
      });
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }

      audioContextInRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      audioContextOutRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });

      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        callbacks: {
          onopen: () => {
            setStatus('connected');
            
            // 1. Stream Audio
            const source = audioContextInRef.current!.createMediaStreamSource(stream!);
            const scriptProcessor = audioContextInRef.current!.createScriptProcessor(4096, 1, 1);
            scriptProcessor.onaudioprocess = (e) => {
              if (isMuted) return;
              const inputData = e.inputBuffer.getChannelData(0);
              const l = inputData.length;
              const int16 = new Int16Array(l);
              for (let i = 0; i < l; i++) {
                int16[i] = inputData[i] * 32768;
              }
              const pcmBlob = {
                data: encode(new Uint8Array(int16.buffer)),
                mimeType: 'audio/pcm;rate=16000',
              };
              sessionPromise.then((session) => {
                session.sendRealtimeInput({ media: pcmBlob });
              });
            };
            source.connect(scriptProcessor);
            scriptProcessor.connect(audioContextInRef.current!.destination);

            // 2. Stream Video Frames
            frameIntervalRef.current = window.setInterval(() => {
              if (isCameraOff || !videoRef.current || !canvasRef.current) return;
              const canvas = canvasRef.current;
              const video = videoRef.current;
              const ctx = canvas.getContext('2d');
              if (!ctx) return;

              canvas.width = 320; 
              canvas.height = 240;
              ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
              
              canvas.toBlob(async (blob) => {
                if (blob) {
                  const reader = new FileReader();
                  reader.onloadend = () => {
                    const base64Data = (reader.result as string).split(',')[1];
                    sessionPromise.then((session) => {
                      session.sendRealtimeInput({
                        media: { data: base64Data, mimeType: 'image/jpeg' }
                      });
                    });
                  };
                  reader.readAsDataURL(blob);
                }
              }, 'image/jpeg', 0.5);
            }, 1000);
          },
          onmessage: async (message: LiveServerMessage) => {
            const base64Audio = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
            if (base64Audio && audioContextOutRef.current) {
              const ctx = audioContextOutRef.current;
              nextStartTimeRef.current = Math.max(nextStartTimeRef.current, ctx.currentTime);
              const audioBuffer = await decodeAudioData(decode(base64Audio), ctx, 24000, 1);
              const source = ctx.createBufferSource();
              source.buffer = audioBuffer;
              source.connect(ctx.destination);
              source.addEventListener('ended', () => {
                sourcesRef.current.delete(source);
              });
              source.start(nextStartTimeRef.current);
              nextStartTimeRef.current += audioBuffer.duration;
              sourcesRef.current.add(source);
            }

            if (message.serverContent?.interrupted) {
              for (const source of sourcesRef.current.values()) {
                try { source.stop(); } catch(e) {}
              }
              sourcesRef.current.clear();
              nextStartTimeRef.current = 0;
            }
          },
          onerror: (e: any) => {
            console.error('Live API Error:', e);
            if (e.message?.includes("Requested entity was not found")) {
              setStatus('key_required');
            } else {
              setStatus('error');
            }
          },
          onclose: () => {
            // Only close if we are not trying to re-authenticate
            if (status !== 'key_required') onClose();
          }
        },
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: character.voice || 'Kore' } },
          },
          systemInstruction: `Bạn đang trong một cuộc gọi video trực tiếp với người dùng. 
          Nhân vật của bạn: ${character.persona}. 
          Tông giọng hiện tại: ${isSpicy ? 'Cực kỳ quyến rũ và thân mật' : 'Thân thiện và tự nhiên'}.
          Hãy phản hồi ngắn gọn, tự nhiên như đang nói chuyện điện thoại. Trả lời bằng tiếng Việt.`,
        },
      });

      sessionRef.current = await sessionPromise;
    } catch (err) {
      console.error('Failed to start call:', err);
      setStatus('error');
    }
  };

  useEffect(() => {
    checkAndStartCall();

    return () => {
      if (frameIntervalRef.current) clearInterval(frameIntervalRef.current);
      if (sessionRef.current) sessionRef.current.close();
      if (audioContextInRef.current) audioContextInRef.current.close();
      if (audioContextOutRef.current) audioContextOutRef.current.close();
    };
  }, []);

  const toggleMute = () => {
    setIsMuted(!isMuted);
  };

  const toggleCamera = () => {
    setIsCameraOff(!isCameraOff);
    if (videoRef.current?.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getVideoTracks().forEach(track => track.enabled = isCameraOff);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] bg-slate-950 flex flex-col items-center justify-center animate-in fade-in duration-500">
      <div className="absolute inset-0 opacity-20 pointer-events-none">
        <img src={character.avatar} alt="" className="w-full h-full object-cover blur-2xl scale-110" />
      </div>

      <div className="relative z-10 w-full max-w-4xl h-full flex flex-col items-center justify-between p-8 text-center">
        
        {status === 'key_required' ? (
          <div className="flex-1 flex flex-col items-center justify-center space-y-6 max-w-md">
            <div className="w-20 h-20 bg-pink-500/20 rounded-full flex items-center justify-center border border-pink-500/50">
              <svg className="w-10 h-10 text-pink-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-white">Yêu cầu API Key</h2>
            <p className="text-slate-400">Cuộc gọi video cao cấp yêu cầu sử dụng API Key trả phí riêng của bạn để đảm bảo chất lượng tốt nhất.</p>
            <button 
              onClick={handleOpenKeySelection}
              className="w-full py-4 bg-pink-600 hover:bg-pink-50 text-white hover:text-pink-600 rounded-2xl font-black transition-all shadow-xl shadow-pink-600/20"
            >
              CHỌN API KEY
            </button>
            <a 
              href="https://ai.google.dev/gemini-api/docs/billing" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-xs text-slate-500 hover:text-pink-400 underline transition-colors"
            >
              Tìm hiểu về thanh toán API
            </a>
            <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors">Để sau</button>
          </div>
        ) : (
          <>
            <div className="space-y-4">
              <div className="relative inline-block">
                <img src={character.avatar} alt={character.name} className={`w-32 h-32 rounded-full border-4 object-cover mx-auto transition-all duration-500 ${status === 'connected' ? 'border-pink-500 shadow-[0_0_30px_rgba(236,72,153,0.3)]' : 'border-slate-700 animate-pulse'}`} />
                {status === 'connected' && <div className="absolute bottom-1 right-1 w-6 h-6 bg-green-500 border-4 border-slate-950 rounded-full animate-pulse"></div>}
              </div>
              <h2 className="text-3xl font-bold text-white tracking-tight">{character.name}</h2>
              <p className="text-slate-400 font-medium">
                {status === 'connecting' ? 'Đang thiết lập kết nối...' : status === 'error' ? 'Lỗi mạng hoặc API Key' : 'Đang trong cuộc gọi...'}
              </p>
              {status === 'error' && (
                <button onClick={startCall} className="mt-4 px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-xs font-bold text-pink-400 transition-colors border border-slate-700">THỬ LẠI</button>
              )}
            </div>

            <div className={`absolute top-8 right-8 w-40 h-56 md:w-56 md:h-72 bg-slate-800 rounded-2xl overflow-hidden border-2 border-slate-700 shadow-2xl transition-all duration-500 transform ${isCameraOff ? 'grayscale opacity-50' : 'hover:scale-105'}`}>
              <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover mirror" />
              <canvas ref={canvasRef} className="hidden" />
              {isCameraOff && (
                 <div className="absolute inset-0 flex items-center justify-center">
                    <svg className="w-12 h-12 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                 </div>
              )}
            </div>

            <div className="flex gap-1 h-12 items-center">
               {status === 'connected' && [...Array(12)].map((_, i) => (
                 <div key={i} className={`w-1.5 bg-pink-500 rounded-full transition-all duration-150 animate-bounce`} style={{ height: `${20 + Math.random() * 80}%`, animationDelay: `${i * 0.1}s` }}></div>
               ))}
            </div>

            <div className="flex items-center gap-6 mb-8">
              <button 
                onClick={toggleMute}
                className={`p-4 rounded-full transition-all border-2 ${isMuted ? 'bg-red-500 border-red-400 text-white' : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'}`}
              >
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-20a3 3 0 00-3 3v8a3 3 0 006 0V3a3 3 0 00-3-3z" />
                </svg>
              </button>

              <button 
                onClick={onClose}
                className="p-6 bg-red-600 hover:bg-red-700 rounded-full text-white shadow-[0_0_20px_rgba(220,38,38,0.5)] transition-all transform hover:scale-110 active:scale-95"
              >
                <svg className="w-10 h-10" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z" />
                </svg>
              </button>

              <button 
                onClick={toggleCamera}
                className={`p-4 rounded-full transition-all border-2 ${isCameraOff ? 'bg-red-500 border-red-400 text-white' : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'}`}
              >
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </button>
            </div>
          </>
        )}
      </div>

      <style>{`
        .mirror {
          transform: scaleX(-1);
        }
      `}</style>
    </div>
  );
};

export default VideoCallOverlay;
