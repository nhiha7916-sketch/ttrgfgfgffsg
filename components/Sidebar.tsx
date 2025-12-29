
import React from 'react';
import { ChatSession } from '../types';
import { CHARACTERS } from '../characters';

interface SidebarProps {
  sessions: ChatSession[];
  activeSessionId: string | null;
  onNewChat: () => void;
  onSelectChat: (id: string) => void;
  onDeleteChat: (id: string) => void;
}

const Sidebar: React.FC<SidebarProps> = ({ 
  sessions, 
  activeSessionId, 
  onNewChat, 
  onSelectChat,
  onDeleteChat
}) => {
  return (
    <div className="w-20 md:w-80 bg-slate-950 border-r border-slate-800/50 flex flex-col z-20">
      <div className="p-4 md:p-6 border-b border-slate-800/50 flex items-center justify-between">
        <h1 className="hidden md:block text-2xl font-black font-brand text-pink-500 tracking-tighter uppercase italic">CORTIS</h1>
        <button 
          onClick={onNewChat}
          className="w-12 h-12 md:w-10 md:h-10 bg-gradient-to-tr from-pink-600 to-rose-500 hover:from-pink-500 hover:to-rose-400 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-pink-500/20 transition-all active:scale-90"
          title="Bắt đầu trò chuyện mới"
        >
          <svg className="w-6 h-6 md:w-5 md:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 4v16m8-8H4" />
          </svg>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto py-6 px-3 space-y-1">
        <div className="hidden md:block px-4 mb-4 text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">
          Hộp thư CORTIS
        </div>
        {sessions.length === 0 ? (
          <div className="hidden md:block px-4 py-10 text-center text-slate-600 text-sm font-medium">
            Chưa có tin nhắn nào từ các thành viên.
          </div>
        ) : (
          sessions.map(session => {
            const character = CHARACTERS.find(c => c.id === session.characterId);
            const isActive = activeSessionId === session.id;
            
            return (
              <div 
                key={session.id}
                className={`group relative p-2 md:p-3 cursor-pointer rounded-2xl flex items-center gap-3 transition-all ${
                  isActive ? 'bg-slate-900 border border-slate-800 shadow-inner' : 'hover:bg-slate-900/50'
                }`}
                onClick={() => onSelectChat(session.id)}
              >
                <div className="relative flex-shrink-0">
                  <img 
                    src={character?.avatar} 
                    alt={character?.name}
                    className={`w-12 h-12 md:w-11 md:h-11 rounded-2xl object-cover transition-all duration-500 ${isActive ? 'scale-110 shadow-lg shadow-pink-500/20 border-2 border-pink-500' : 'border border-slate-700'}`}
                  />
                  {isActive && <div className="absolute -top-1 -right-1 w-3 h-3 bg-pink-500 rounded-full border-2 border-slate-950 animate-pulse"></div>}
                </div>
                
                <div className="hidden md:block flex-1 min-w-0">
                  <div className="flex justify-between items-center mb-0.5">
                    <div className={`text-sm font-bold truncate ${isActive ? 'text-white' : 'text-slate-300 group-hover:text-white'}`}>
                      {character?.name}
                    </div>
                    {session.isSpicy && (
                      <svg className="w-3 h-3 text-rose-500" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                      </svg>
                    )}
                  </div>
                  <div className="text-xs text-slate-500 truncate font-medium">
                    {session.messages[session.messages.length - 1]?.content}
                  </div>
                </div>

                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteChat(session.id);
                  }}
                  className="hidden md:block opacity-0 group-hover:opacity-100 p-1.5 hover:bg-red-500/10 hover:text-red-500 text-slate-600 transition-all rounded-lg"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            );
          })
        )}
      </div>

      <div className="p-4 border-t border-slate-800/50 text-[10px] text-slate-600 font-bold uppercase tracking-widest text-center">
        CORTIS Entertainment © 2025
      </div>
    </div>
  );
};

export default Sidebar;
