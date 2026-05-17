import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Mic, MicOff, Video, VideoOff, PhoneOff, Sparkles, User, MessageCircle } from 'lucide-react';

interface LiveSessionProps {
  onClose: () => void;
  username: string;
}

export const LiveSession: React.FC<LiveSessionProps> = ({ onClose, username }) => {
  const [isActive, setIsActive] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [transcripts, setTranscripts] = useState<{ role: string; text: string }[]>([]);
  const [aiStatus, setAiStatus] = useState('Menghubungkan...');
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const streamRef = useRef<MediaStream | null>(null);
  const frameIntervalRef = useRef<number | null>(null);

  useEffect(() => {
    startSession();
    return () => stopSession();
  }, []);

  const startSession = async () => {
    try {
      // 1. Get User Media
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: true, 
        video: true 
      });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;

      // 2. Setup WebSocket
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${protocol}//${window.location.host}/ws/live`);
      wsRef.current = ws;

      ws.onopen = () => {
        setIsActive(true);
        setAiStatus('Mentor Online');
        setupAudioProcessing(stream);
        startVideoStreaming();
      };

      ws.onmessage = async (event) => {
        const msg = JSON.parse(event.data);
        
        // Handle Audio Output
        if (msg.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data) {
          playAudioChunk(msg.serverContent.modelTurn.parts[0].inlineData.data);
        }

        // Handle Interruption
        if (msg.serverContent?.interrupted) {
           // Clear audio queue if needed
           nextStartTimeRef.current = audioCtxRef.current?.currentTime || 0;
        }

        // Handle Transcription
        if (msg.serverContent?.modelTurn?.parts?.[0]?.text) {
           updateTranscripts('model', msg.serverContent.modelTurn.parts[0].text);
        }
      };

      ws.onerror = (err) => {
        console.error('WS Error:', err);
        setAiStatus('Error Koneksi');
      };

      ws.onclose = () => {
        setIsActive(false);
        setAiStatus('Offline');
      };

    } catch (err) {
      console.error('Failed to start live session:', err);
      alert('Gagal mengakses kamera/mikrofon.');
      onClose();
    }
  };

  const setupAudioProcessing = (stream: MediaStream) => {
    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
    audioCtxRef.current = audioCtx;
    nextStartTimeRef.current = audioCtx.currentTime;

    const source = audioCtx.createMediaStreamSource(stream);
    const processor = audioCtx.createScriptProcessor(4096, 1, 1);
    processorRef.current = processor;

    source.connect(processor);
    processor.connect(audioCtx.destination);

    processor.onaudioprocess = (e) => {
      if (isMuted || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

      const inputData = e.inputBuffer.getChannelData(0);
      const pcmData = new Int16Array(inputData.length);
      for (let i = 0; i < inputData.length; i++) {
        pcmData[i] = Math.max(-1, Math.min(1, inputData[i])) * 0x7FFF;
      }
      
      const base64 = btoa(String.fromCharCode(...new Uint8Array(pcmData.buffer)));
      wsRef.current.send(JSON.stringify({ audio: base64 }));
    };
  };

  const startVideoStreaming = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 240;
    const ctx = canvas.getContext('2d');

    frameIntervalRef.current = window.setInterval(() => {
      if (isCameraOff || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN || !videoRef.current || !ctx) return;

      ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
      const base64 = canvas.toDataURL('image/jpeg', 0.5).split(',')[1];
      wsRef.current.send(JSON.stringify({ video: base64 }));
    }, 1000); // Send 1 frame per second to save bandwidth
  };

  const playAudioChunk = async (base64: string) => {
    if (!audioCtxRef.current) return;
    
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    
    const pcmData = new Int16Array(bytes.buffer);
    const floatData = new Float32Array(pcmData.length);
    for (let i = 0; i < pcmData.length; i++) floatData[i] = pcmData[i] / 0x7FFF;

    const buffer = audioCtxRef.current.createBuffer(1, floatData.length, 16000);
    buffer.copyToChannel(floatData, 0);

    const source = audioCtxRef.current.createBufferSource();
    source.buffer = buffer;
    source.connect(audioCtxRef.current.destination);
    
    const startTime = Math.max(nextStartTimeRef.current, audioCtxRef.current.currentTime);
    source.start(startTime);
    nextStartTimeRef.current = startTime + buffer.duration;
  };

  const updateTranscripts = (role: string, text: string) => {
    setTranscripts(prev => {
      const last = prev[prev.length - 1];
      if (last && last.role === role) {
        return [...prev.slice(0, -1), { role, text: last.text + text }];
      }
      return [...prev, { role, text }];
    });
  };

  const stopSession = () => {
    if (wsRef.current) wsRef.current.close();
    if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    if (processorRef.current) processorRef.current.disconnect();
    if (audioCtxRef.current) audioCtxRef.current.close();
    if (frameIntervalRef.current) clearInterval(frameIntervalRef.current);
  };

  const toggleMute = () => setIsMuted(!isMuted);
  const toggleCamera = () => {
    setIsCameraOff(!isCameraOff);
    if (streamRef.current) {
        streamRef.current.getVideoTracks().forEach(t => t.enabled = isCameraOff);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-neutral-950 flex flex-col md:p-6"
    >
      {/* Call Header */}
      <div className="flex items-center justify-between p-4 md:p-0 mb-4 bg-neutral-900 md:bg-transparent rounded-b-2xl md:rounded-none">
        <div className="flex items-center gap-3">
          <div className="bg-indigo-500/20 p-2 rounded-xl">
             <Sparkles className="w-5 h-5 text-indigo-400" />
          </div>
          <div>
            <h2 className="text-white font-bold tracking-tight">VibeMentor Live</h2>
            <p className="text-xs text-emerald-400 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              {aiStatus}
            </p>
          </div>
        </div>
        <div className="hidden md:flex items-center gap-4 bg-neutral-900 border border-neutral-800 px-4 py-2 rounded-2xl">
           <AnimatePresence mode="popLayout">
             {transcripts.length > 0 && (
               <motion.div 
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  className="text-sm text-neutral-300 italic max-w-md truncate"
               >
                 "{transcripts[transcripts.length - 1].text}"
               </motion.div>
             )}
           </AnimatePresence>
        </div>
      </div>

      {/* Video Grid */}
      <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4 h-full">
        {/* Mentor View */}
        <div className="relative bg-neutral-900 rounded-3xl overflow-hidden border border-neutral-800 shadow-2xl flex items-center justify-center">
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent z-10" />
            
            {/* AI Avatar / Visualizer */}
            <div className="flex flex-col items-center">
                <div className="relative">
                    <motion.div 
                        animate={{ 
                            scale: isActive ? [1, 1.1, 1] : 1,
                            rotate: isActive ? [0, 5, -5, 0] : 0
                        }}
                        transition={{ repeat: Infinity, duration: 3 }}
                        className="w-32 h-32 md:w-48 md:h-48 bg-indigo-600 rounded-full flex items-center justify-center shadow-[0_0_50px_rgba(79,70,229,0.3)] mb-6"
                    >
                        <Sparkles size={isActive ? 64 : 48} className="text-white" />
                    </motion.div>
                    {isActive && (
                        <div className="absolute -inset-4 border-2 border-indigo-500/30 rounded-full animate-ping" />
                    )}
                </div>
                <h3 className="text-xl font-bold text-white z-20">VibeMentor</h3>
                <p className="text-neutral-400 text-sm z-20">Tutor AI Favorit Kamu</p>
            </div>

            <div className="absolute bottom-4 left-4 z-20 flex items-center gap-2 bg-black/40 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/10">
                <div className="w-2 h-2 rounded-full bg-indigo-500" />
                <span className="text-xs font-medium text-white">Mentor Presenter</span>
            </div>
        </div>

        {/* User View */}
        <div className="relative bg-neutral-900 rounded-3xl overflow-hidden border border-neutral-800 shadow-2xl">
            {isCameraOff ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-neutral-500">
                    <User size={64} className="mb-4 opacity-20" />
                    <p className="text-sm font-medium">Kamera Dimatikan</p>
                </div>
            ) : (
                <video 
                    ref={videoRef} 
                    autoPlay 
                    muted 
                    playsInline 
                    className="w-full h-full object-cover mirror"
               />
            )}
            
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent z-10" />

            <div className="absolute bottom-4 left-4 z-20 flex items-center gap-2 bg-black/40 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/10">
                <div className="w-2 h-2 rounded-full bg-emerald-500" />
                <span className="text-xs font-medium text-white">{username} (Kamu)</span>
            </div>
        </div>
      </div>

      {/* Floating Transcripts for Mobile */}
      <div className="md:hidden p-4 bg-neutral-950/80 backdrop-blur-md mt-4 rounded-t-3xl min-h-[60px]">
          <AnimatePresence mode="popLayout">
             {transcripts.length > 0 && (
               <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-sm text-neutral-200 text-center line-clamp-2"
               >
                 "{transcripts[transcripts.length - 1].text}"
               </motion.div>
             )}
           </AnimatePresence>
      </div>

      {/* Controls */}
      <div className="p-6 md:p-8 flex items-center justify-center gap-4 md:gap-8 bg-neutral-950">
        <button 
            onClick={toggleMute}
            className={`p-4 rounded-full transition-all active:scale-95 ${
                isMuted ? 'bg-red-600 text-white shadow-lg shadow-red-600/30' : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700'
            }`}
        >
            {isMuted ? <MicOff size={24} /> : <Mic size={24} />}
        </button>

        <button 
            onClick={toggleCamera}
            className={`p-4 rounded-full transition-all active:scale-95 ${
                isCameraOff ? 'bg-red-600 text-white shadow-lg shadow-red-600/30' : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700'
            }`}
        >
            {isCameraOff ? <VideoOff size={24} /> : <Video size={24} />}
        </button>

        <button 
            onClick={onClose}
            className="p-4 bg-red-500 hover:bg-red-600 text-white rounded-full shadow-lg shadow-red-500/30 transition-all active:scale-95 px-8 flex items-center gap-2 font-bold"
        >
            <PhoneOff size={24} />
            <span className="hidden md:inline">Akhiri Sesi</span>
        </button>

        <button className="p-4 bg-neutral-800 text-neutral-300 hover:bg-neutral-700 rounded-full transition-all active:scale-95">
           <MessageCircle size={24} />
        </button>
      </div>

      <style>{`
        .mirror {
            transform: scaleX(-1);
        }
      `}</style>
    </motion.div>
  );
};
