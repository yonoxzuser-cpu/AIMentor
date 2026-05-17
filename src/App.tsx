import { BookOpen, Bot, Loader2, Send, Sparkles, User, Paperclip, Mic, Square, Trash2, X, File as FileIcon, Image as ImageIcon, Video } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import React, { useEffect, useRef, useState } from 'react';
import Markdown from 'react-markdown';
import { LiveSession } from './components/LiveSession';

interface Attachment {
  mimeType: string;
  data: string; // base64
  name?: string;
}

interface Message {
  role: 'user' | 'model';
  text: string;
  attachments?: Attachment[];
}

const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = (error) => reject(error);
  });
};

const formatDuration = (seconds: number) => {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
};

export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(() => {
    return localStorage.getItem('vibe_mentor_auth') === 'true';
  });
  const [username, setUsername] = useState(() => {
    return localStorage.getItem('vibe_mentor_user') || '';
  });

  const [chatHistory, setChatHistory] = useState<Message[]>(() => {
    const saved = localStorage.getItem('vibeMentorHistory');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {}
    }
    return [
      {
        role: 'model',
        text: 'Halo teman belajar! 👋 Aku VibeMentor. Ada materi atau konsep baru yang bikin kamu penasaran atau bingung hari ini? Yuk kita bedah bareng-bareng secara asik!',
      },
    ];
  });
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [pendingAttachments, setPendingAttachments] = useState<File[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [recordedAudio, setRecordedAudio] = useState<{ url: string; blob: Blob } | null>(null);
  const [isLiveMode, setIsLiveMode] = useState(false);

  const chatContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<BlobPart[]>([]);
  const recordingTimerRef = useRef<number | null>(null);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (username.trim()) {
      setIsLoggedIn(true);
      localStorage.setItem('vibe_mentor_auth', 'true');
      localStorage.setItem('vibe_mentor_user', username);
    }
  };

  const handleLogout = () => {
    setIsLoggedIn(false);
    localStorage.removeItem('vibe_mentor_auth');
  };

  // Set chat history to local storage
  useEffect(() => {
    if (!isLoggedIn) return;
    try {
      localStorage.setItem('vibeMentorHistory', JSON.stringify(chatHistory));
    } catch (e) {
      if (e instanceof DOMException && e.name === 'QuotaExceededError') {
        try {
          const lightweightHistory = chatHistory.slice(-10).map(msg => ({ ...msg, attachments: [] }));
          localStorage.setItem('vibeMentorHistory', JSON.stringify(lightweightHistory));
        } catch (err) {
          console.error("Local storage still exceeding quota.");
        }
      }
    }
  }, [chatHistory, isLoggedIn]);

  // Auto-scroll chat to bottom
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [chatHistory, isLoading, pendingAttachments, recordedAudio]);

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-neutral-950 flex items-center justify-center p-4 font-sans">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md bg-neutral-900 border border-neutral-800 p-8 rounded-3xl shadow-2xl"
        >
          <div className="flex flex-col items-center mb-8">
            <div className="bg-indigo-500/20 p-4 rounded-2xl border border-indigo-500/30 mb-4 shadow-[0_0_20px_rgba(99,102,241,0.2)]">
              <Sparkles className="w-10 h-10 text-indigo-400" />
            </div>
            <h1 className="text-3xl font-bold text-white mb-2">VibeMentor</h1>
            <p className="text-neutral-400 text-center">Selamat datang kembali! Yuk masuk buat mulai belajar bareng mentor AI paling asik.</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-neutral-400 mb-2 ml-1">Username / Nickname</label>
              <input 
                type="text" 
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Ex: Teman Belajar"
                className="w-full bg-neutral-950 border border-neutral-700/80 rounded-2xl px-5 py-4 text-white focus:outline-none focus:border-indigo-500 transition-all placeholder:text-neutral-700"
              />
            </div>
            <button 
              type="submit"
              className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-4 rounded-2xl shadow-lg transition-all active:scale-[0.98]"
            >
              Mulai Sesi Belajar
            </button>
          </form>
          
          <div className="mt-8 text-center">
            <p className="text-xs text-neutral-600 tracking-tight">By entering, you join the #JuaraVibeCoding community 🚀</p>
          </div>
        </motion.div>
      </div>
    );
  }

  const clearHistory = () => {
    if (confirm('Yakin ingin menghapus seluruh riwayat chat?')) {
      setChatHistory([
        {
          role: 'model',
          text: 'Halo teman belajar! 👋 Aku VibeMentor. Ada materi atau konsep baru yang bikin kamu penasaran atau bingung hari ini? Yuk kita bedah bareng-bareng secara asik!',
        },
      ]);
      localStorage.removeItem('vibeMentorHistory');
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setPendingAttachments(prev => [...prev, ...Array.from(e.target.files!)]);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const removeAttachment = (index: number) => {
    setPendingAttachments(prev => prev.filter((_, i) => i !== index));
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingDuration(0);

      recordingTimerRef.current = window.setInterval(() => {
        setRecordingDuration(prev => prev + 1);
      }, 1000);
    } catch (err) {
      console.error("Microphone access denied or error", err);
      alert("Gagal mengakses mikrofon. Pastikan kamu telah memberikan izin mikrofon di browser.");
    }
  };

  const stopRecordingAudio = (discard: boolean = false) => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.onstop = () => {
        if (!discard) {
          const blob = new Blob(audioChunksRef.current, { type: mediaRecorderRef.current?.mimeType || 'audio/webm' });
          const url = URL.createObjectURL(blob);
          setRecordedAudio({ url, blob });
        }
        mediaRecorderRef.current?.stream.getTracks().forEach(t => t.stop());
      };
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    }
  };

  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if ((!inputText.trim() && pendingAttachments.length === 0 && !recordedAudio) || isLoading) return;

    const userMessageText = inputText.trim();
    const attachmentsToSent: Attachment[] = [];
    setIsLoading(true);

    try {
      for (const file of pendingAttachments) {
        const base64 = await fileToBase64(file);
        attachmentsToSent.push({
          mimeType: file.type,
          data: base64,
          name: file.name
        });
      }

      if (recordedAudio) {
        const base64 = await fileToBase64(new File([recordedAudio.blob], "voice.webm", { type: recordedAudio.blob.type }));
        attachmentsToSent.push({
          mimeType: recordedAudio.blob.type,
          data: base64,
          name: "Voice Message"
        });
      }

      const newUserMsg: Message = {
        role: 'user',
        text: userMessageText,
        attachments: attachmentsToSent.length > 0 ? attachmentsToSent : undefined
      };

      const newHistory = [...chatHistory, newUserMsg];
      setChatHistory(newHistory);
      setInputText('');
      setPendingAttachments([]);
      setRecordedAudio(null);

      const contents = newHistory.map((m) => {
        const parts: any[] = [];
        if (m.text) {
          parts.push({ text: m.text });
        } else if (m.role === 'user' && m.attachments && m.attachments.length > 0) {
          parts.push({ text: "Tolong analisa lampiran ini secara asik." });
        }
        
        if (m.attachments) {
          m.attachments.forEach(att => {
            parts.push({
              inlineData: {
                data: att.data,
                mimeType: att.mimeType
              }
            });
          });
        }
        return { role: m.role, parts };
      });

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents, systemInstruction: "Kamu adalah VibeMentor. Tutor AI yang asik." }),
      });

      if (!response.ok) throw new Error('API call failed');
      
      const data = await response.json();
      const responseText = data.text || '';
      setChatHistory([...newHistory, { role: 'model', text: responseText }]);
    } catch (error) {
      console.error('Error fetching VibeMentor response:', error);
      setChatHistory(prev => [
        ...prev,
        {
          role: 'model',
          text: 'Wah, sepertinya ada gangguan sinyal sebentar atau file yang dikirim terlalu besar. Boleh bantu kirim ulang?',
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-neutral-950 text-neutral-100 font-sans selection:bg-indigo-500/30">
      <AnimatePresence>
        {isLiveMode && (
          <LiveSession username={username} onClose={() => setIsLiveMode(false)} />
        )}
      </AnimatePresence>

      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 bg-neutral-950/80 backdrop-blur-md border-b border-neutral-800 z-10 shrink-0">
        <div className="flex items-center gap-3">
          <div className="bg-indigo-500/20 p-2.5 rounded-xl border border-indigo-500/30 shadow-[0_0_15px_rgba(99,102,241,0.2)]">
            <Sparkles className="w-6 h-6 text-indigo-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
              VibeMentor <span className="text-xs bg-indigo-600 px-2 py-0.5 rounded-full font-medium tracking-wide uppercase">BETA</span>
            </h1>
            <p className="text-xs font-medium text-neutral-400 flex items-center gap-1.5 mt-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Halo, {username || 'Teman Belajar'}!
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={() => setIsLiveMode(true)} 
            className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600/10 hover:bg-indigo-600/20 border border-indigo-500/30 text-indigo-400 rounded-xl transition-all shadow-[0_0_15px_rgba(99,102,241,0.1)] active:scale-95"
          >
            <Video className="w-5 h-5" />
            <span className="hidden md:inline font-semibold">Live Mentor</span>
          </button>
          
          <button onClick={clearHistory} title="Bersihkan Chat" className="p-2.5 text-neutral-400 bg-neutral-900/50 border border-neutral-800 rounded-xl hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/30 transition-all focus:outline-none ml-2">
            <Trash2 className="w-5 h-5" />
          </button>
          <button onClick={handleLogout} title="Keluar" className="p-2.5 text-neutral-400 bg-neutral-900/50 border border-neutral-800 rounded-xl hover:bg-neutral-800 hover:text-white transition-all focus:outline-none">
            <X className="w-5 h-5" />
          </button>
          <div className="hidden lg:flex items-center gap-2 text-sm text-neutral-400 bg-neutral-900 border border-neutral-800 px-4 py-2.5 rounded-xl ml-2">
            <BookOpen className="w-4 h-4 text-emerald-400" />
            <span>#JuaraVibeCoding</span>
          </div>
        </div>
      </header>

      {/* Main Chat Area */}
      <main 
        className="flex-1 overflow-y-auto px-4 py-8 md:px-8 space-y-8 scroll-smooth" 
        ref={chatContainerRef}
      >
        <div className="max-w-4xl mx-auto space-y-8 flex flex-col justify-end min-h-full pb-4">
          {chatHistory.map((msg, i) => {
            const isModel = msg.role === 'model';
            return (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                key={i}
                className={`flex gap-4 md:gap-6 w-full ${isModel ? 'flex-row' : 'flex-row-reverse'}`}
              >
                {/* Avatar */}
                <div className={`shrink-0 w-10 h-10 md:w-12 md:h-12 rounded-full flex items-center justify-center shadow-lg ${
                  isModel ? 'bg-gradient-to-br from-indigo-500 to-purple-600 text-white border-2 border-indigo-500/30' : 'bg-neutral-800 text-neutral-400 border border-neutral-700'
                }`}>
                  {isModel ? <Bot size={20} className="drop-shadow-md" /> : <User size={20} />}
                </div>

                {/* Message Bubble */}
                <div className={`flex flex-col flex-1 max-w-[85%] md:max-w-[75%] ${isModel ? 'items-start' : 'items-end'}`}>
                  <span className="text-xs font-semibold text-neutral-500 mb-1.5 ml-1">
                    {isModel ? 'VibeMentor' : 'Kamu'}
                  </span>
                  
                  <div className={`px-5 py-4 rounded-3xl text-sm md:text-base leading-relaxed shadow-md ${
                    isModel
                      ? 'bg-neutral-900 border border-neutral-800/80 text-neutral-200 rounded-tl-sm'
                      : 'bg-indigo-600 text-white rounded-tr-sm'
                  }`}>
                    {msg.attachments && msg.attachments.length > 0 && (
                      <div className="flex flex-wrap gap-3 mt-1 mb-3">
                        {msg.attachments.map((att, idx) => {
                          if (att.mimeType.startsWith('image/')) {
                            return (
                              <a key={idx} href={`data:${att.mimeType};base64,${att.data}`} target="_blank" rel="noopener noreferrer">
                                <img src={`data:${att.mimeType};base64,${att.data}`} alt="attachment" className="max-h-48 max-w-[200px] object-cover rounded-xl border border-neutral-700/50 hover:brightness-110 transition-all cursor-zoom-in" />
                              </a>
                            );
                          }
                          if (att.mimeType.startsWith('audio/')) {
                            return (
                              <audio key={idx} src={`data:${att.mimeType};base64,${att.data}`} controls className="h-10 max-w-[240px] rounded-full border border-neutral-700/50" />
                            );
                          }
                          return (
                            <div key={idx} className="flex items-center gap-2 bg-neutral-950/50 px-3 py-2 rounded-xl border border-neutral-800/50 text-sm">
                              <FileIcon size={16} className={isModel ? 'text-indigo-400' : 'text-indigo-200'} />
                              <span className="truncate max-w-[150px]">{att.name || 'File document'}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    {isModel ? (
                      <div className="markdown-body [&>p]:mb-4 [&>p:last-child]:mb-0 [&_h1]:text-2xl [&_h1]:font-bold [&_h1]:text-white [&_h1]:mb-3 [&_h1]:mt-6 [&>h1:first-child]:mt-0 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-white [&_h2]:mb-2 [&_h2]:mt-5 [&>h2:first-child]:mt-0 [&_h3]:text-lg [&_h3]:font-medium [&_h3]:text-white [&_h3]:mb-2 [&_h3]:mt-4 [&>h3:first-child]:mt-0 [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:mb-4 [&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:mb-4 [&_li]:mb-1.5 [&_li::marker]:text-indigo-400 [&_strong]:text-indigo-300 [&_strong]:font-semibold [&_em]:text-neutral-300 [&_code]:bg-neutral-800 [&_code]:text-indigo-200 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded-md [&_code]:text-sm [&_pre]:bg-neutral-950 [&_pre]:border [&_pre]:border-neutral-800 [&_pre]:p-4 [&_pre]:rounded-xl [&_pre]:mb-4 [&_pre]:overflow-x-auto [&_pre>code]:bg-transparent [&_pre>code]:p-0 [&_pre>code]:text-neutral-300 [&_blockquote]:border-l-4 [&_blockquote]:border-indigo-500/50 [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-neutral-400 [&_blockquote]:mb-4 [&_a]:text-indigo-400 [&_a]:underline [&_hr]:border-neutral-800 [&_hr]:my-6">
                        <Markdown>{msg.text}</Markdown>
                      </div>
                    ) : (
                      <span className="whitespace-pre-wrap">{msg.text}</span>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })}
          
          {isLoading && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex gap-4 md:gap-6 w-full"
            >
              <div className="shrink-0 w-10 h-10 md:w-12 md:h-12 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center animate-pulse border border-indigo-500/30">
                <Loader2 size={20} className="animate-spin" />
              </div>
              <div className="flex flex-col items-start w-full max-w-[85%] md:max-w-[75%]">
                <span className="text-xs font-semibold text-neutral-500 mb-1.5 ml-1">
                  VibeMentor
                </span>
                <div className="px-5 py-4 rounded-3xl rounded-tl-sm bg-neutral-900 border border-neutral-800 text-neutral-400 flex items-center gap-2 shadow-sm">
                  <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse"></span>
                  <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse delay-75"></span>
                  <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse delay-150"></span>
                  <span className="ml-2 text-sm italic">Sedang menyusun materi...</span>
                </div>
              </div>
            </motion.div>
          )}
        </div>
      </main>

      {/* Input Area */}
      <footer className="bg-neutral-950/80 backdrop-blur-md border-t border-neutral-800 p-4 md:p-6 shrink-0 z-10">
        <div className="max-w-4xl mx-auto">
          {/* Attachment Previews */}
          {(pendingAttachments.length > 0 || isRecording || recordedAudio) && (
            <div className="flex flex-wrap gap-2 mb-3">
              {pendingAttachments.map((f, i) => (
                <div key={i} className="flex items-center gap-2 bg-neutral-800 text-neutral-200 px-3 py-1.5 rounded-lg text-sm border border-neutral-700 shadow-sm transition-all hover:bg-neutral-700">
                  {f.type.startsWith('image/') ? <ImageIcon size={14} className="text-indigo-400" /> : <FileIcon size={14} className="text-indigo-400" />}
                  <span className="truncate max-w-[120px] text-xs">{f.name}</span>
                  <button type="button" onClick={() => removeAttachment(i)} className="text-neutral-400 hover:text-red-400 transition-colors bg-neutral-900 rounded-full p-0.5">
                    <X size={12} />
                  </button>
                </div>
              ))}
              {isRecording && (
                <div className="flex items-center gap-4 bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-1.5 rounded-lg">
                  <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                  <span className="font-mono text-sm">{formatDuration(recordingDuration)}</span>
                  <div className="flex items-center gap-2 border-l border-red-500/20 pl-3">
                    <button type="button" onClick={() => stopRecordingAudio(true)} title="Batal" className="hover:text-red-300 transition-colors"><Trash2 size={16} /></button>
                    <button type="button" onClick={() => stopRecordingAudio(false)} title="Simpan" className="hover:text-red-300 transition-colors"><Square size={16} /></button>
                  </div>
                </div>
              )}
              {recordedAudio && (
                <div className="flex items-center gap-3 bg-neutral-800 border border-neutral-700 px-3 py-1.5 rounded-lg">
                  <Mic size={14} className="text-indigo-400" />
                  <audio src={recordedAudio.url} controls className="h-6 w-[160px]" />
                  <button type="button" onClick={() => setRecordedAudio(null)} className="text-neutral-400 hover:text-red-400 transition-colors ml-1 bg-neutral-900 rounded-full p-0.5">
                    <X size={12} />
                  </button>
                </div>
              )}
            </div>
          )}

          <form onSubmit={handleSend} className="relative flex items-end shadow-lg">
            <input 
              type="file"
              ref={fileInputRef}
              onChange={handleFileSelect}
              className="hidden"
              multiple
              accept="image/*, audio/*, application/pdf"
            />
            {/* Attachment & Mic Buttons */}
            <div className="absolute left-2 top-2 bottom-2 flex items-center gap-1 z-10">
              <button 
                type="button" 
                onClick={() => fileInputRef.current?.click()} 
                className="p-2 text-neutral-400 hover:text-white rounded-full hover:bg-neutral-800 transition-colors disabled:opacity-50"
                disabled={isLoading}
                title="Lampirkan File/Foto"
              >
                <Paperclip size={18} />
              </button>
              <button 
                type="button" 
                onClick={startRecording} 
                className={`p-2 rounded-full transition-colors ${isRecording ? 'text-red-500 bg-red-500/20' : 'text-neutral-400 hover:text-white hover:bg-neutral-800'} disabled:opacity-50`}
                disabled={isLoading || isRecording}
                title="Kirim Pesan Suara"
              >
                <Mic size={18} />
              </button>
            </div>

            <textarea
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="Apa kabar hari ini?"
              className="w-full bg-neutral-900 border border-neutral-700/80 rounded-3xl pl-24 pr-16 py-4 md:py-5 min-h-[60px] max-h-[150px] text-sm md:text-base focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all placeholder:text-neutral-500 resize-none scrollbar-hide"
              disabled={isLoading}
              rows={1}
            />
            <button
              type="submit"
              disabled={isLoading || (!inputText.trim() && pendingAttachments.length === 0 && !recordedAudio)}
              className="absolute right-2 top-2 bottom-2 text-white bg-indigo-600 hover:bg-indigo-500 disabled:bg-neutral-800/80 disabled:text-neutral-600 w-10 md:w-12 rounded-full flex items-center justify-center transition-all cursor-pointer group"
            >
              <Send size={18} className={`transition-transform ${!isLoading && (inputText.trim() || pendingAttachments.length > 0 || recordedAudio) ? 'group-hover:translate-x-0.5 group-hover:-translate-y-0.5' : ''}`} />
            </button>
          </form>
          <div className="text-center mt-3 mb-1">
            <span className="text-[10px] md:text-xs text-neutral-500 tracking-wide">
              Tekan <kbd className="font-sans bg-neutral-800 px-1 border border-neutral-700 rounded text-neutral-400">Enter</kbd> untuk mengirim, <kbd className="font-sans bg-neutral-800 px-1 border border-neutral-700 rounded text-neutral-400">Shift + Enter</kbd> untuk baris baru.
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}


