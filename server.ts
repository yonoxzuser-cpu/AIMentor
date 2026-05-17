import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import path from 'path';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';

dotenv.config();

const PORT =  process.env.PORT || 8080;
const app = express();
app.use(express.json({ limit: '50mb' }));

const server = createServer(app);
const wss = new WebSocketServer({ noServer: true });

// Gemini Initialization
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

// --- API Routes ---

// Chat API proxy
app.post('/api/chat', async (req, res) => {
  try {
    const { contents, systemInstruction } = req.body;
    
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents,
      config: {
        systemInstruction,
        temperature: 0.7,
      },
    });

    res.json({ text: response.text });
  } catch (error: any) {
    console.error('Chat API Error:', error);
    res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
});

// --- WebSocket Handling for Live API ---

server.on('upgrade', (request, socket, head) => {
  const { pathname } = new URL(request.url || '', `http://${request.headers.host}`);

  if (pathname === '/ws/live') {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  } else {
    socket.destroy();
  }
});

wss.on('connection', async (clientWs: WebSocket) => {
  console.log('Client connected to Live WS');
  let session: any = null;

  try {
    session = await ai.live.connect({
      model: 'gemini-3.1-flash-live-preview',
      callbacks: {
        onmessage: (message: LiveServerMessage) => {
          // Forward everything from Gemini to Client
          clientWs.send(JSON.stringify(message));
        },
      },
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } },
        },
        systemInstruction: "Kamu adalah VibeMentor dalam mode Live Video Call. Kamu cerdas, asik, dan suportif. Berikan respon singkat dan padat karena ini adalah percakapan suara real-time. Jangan terlalu panjang lebar agar percakapan tetap mengalir lancar. Kamu bisa melihat user melalui kamera jika mereka mengirimkan frame video.",
      },
    });

    clientWs.on('message', (data) => {
      try {
        const payload = JSON.parse(data.toString());
        
        if (payload.audio) {
          session.sendRealtimeInput({
            audio: { data: payload.audio, mimeType: 'audio/pcm;rate=16000' },
          });
        }
        
        if (payload.video) {
          session.sendRealtimeInput({
            video: { data: payload.video, mimeType: 'image/jpeg' },
          });
        }

        if (payload.text) {
           session.sendRealtimeInput({
            text: payload.text
          });
        }
      } catch (err) {
        console.error('Error processing client message:', err);
      }
    });

    clientWs.on('close', () => {
      console.log('Client disconnected from Live WS');
      if (session) session.close();
    });

  } catch (error) {
    console.error('Gemini Live Connection Error:', error);
    clientWs.close();
  }
});

// --- Vite integration ---

async function setupVite() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }
}

setupVite().then(() => {
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running at http://localhost:${PORT}`);
  });
});
