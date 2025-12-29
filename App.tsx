
import React, { useState, useEffect, useCallback } from 'react';
import { HashRouter as Router, Routes, Route, useNavigate } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import CharacterGallery from './components/CharacterGallery';
import ChatInterface from './components/ChatInterface';
import { Character, ChatSession, Message } from './types';
import { CHARACTERS } from './characters';

const AppContent: React.FC = () => {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const navigate = useNavigate();

  // Load from local storage
  useEffect(() => {
    const saved = localStorage.getItem('doki_sessions');
    if (saved) {
      setSessions(JSON.parse(saved));
    }
  }, []);

  // Save to local storage
  useEffect(() => {
    localStorage.setItem('doki_sessions', JSON.stringify(sessions));
  }, [sessions]);

  const startChat = (character: Character) => {
    const existing = sessions.find(s => s.characterId === character.id);
    if (existing) {
      setActiveSessionId(existing.id);
      navigate(`/chat/${existing.id}`);
    } else {
      const newSession: ChatSession = {
        id: `session_${Date.now()}`,
        characterId: character.id,
        messages: [{
          id: 'initial',
          role: 'model',
          content: character.greeting,
          timestamp: Date.now()
        }],
        lastUpdated: Date.now(),
        isSpicy: false
      };
      setSessions([newSession, ...sessions]);
      setActiveSessionId(newSession.id);
      navigate(`/chat/${newSession.id}`);
    }
  };

  const updateSessionMessages = useCallback((sessionId: string, newMessages: Message[]) => {
    setSessions(prev => prev.map(s => 
      s.id === sessionId 
        ? { ...s, messages: newMessages, lastUpdated: Date.now() } 
        : s
    ));
  }, []);

  const updateSessionData = useCallback((sessionId: string, data: Partial<ChatSession>) => {
    setSessions(prev => prev.map(s => 
      s.id === sessionId 
        ? { ...s, ...data, lastUpdated: Date.now() } 
        : s
    ));
  }, []);

  const deleteSession = (sessionId: string) => {
    setSessions(prev => prev.filter(s => s.id !== sessionId));
    if (activeSessionId === sessionId) {
      setActiveSessionId(null);
      navigate('/');
    }
  };

  return (
    <div className="flex h-screen bg-slate-900 overflow-hidden">
      <Sidebar 
        sessions={sessions} 
        activeSessionId={activeSessionId}
        onNewChat={() => navigate('/')}
        onSelectChat={(id) => {
          setActiveSessionId(id);
          navigate(`/chat/${id}`);
        }}
        onDeleteChat={deleteSession}
      />
      <main className="flex-1 relative overflow-auto">
        <Routes>
          <Route path="/" element={<CharacterGallery onSelect={startChat} />} />
          <Route path="/chat/:sessionId" element={
            <ChatInterface 
              sessions={sessions} 
              onUpdateMessages={updateSessionMessages}
              onUpdateSessionData={updateSessionData}
            />
          } />
        </Routes>
      </main>
    </div>
  );
};

const App: React.FC = () => {
  return (
    <Router>
      <AppContent />
    </Router>
  );
};

export default App;
