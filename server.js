const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const next = require('next');
const path = require('path');

const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();

// Store active sessions and their data
const sessions = new Map();

// Create Express server
const server = express();
const httpServer = http.createServer(server);
const io = socketIo(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Middleware
server.use(cors());
server.use(express.json());

// Health check endpoint - ALWAYS available
server.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    activeSessions: sessions.size,
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // Join a session
  socket.on('join-session', (sessionId, userData) => {
    socket.join(sessionId);
    
    if (!sessions.has(sessionId)) {
      sessions.set(sessionId, {
        users: [],
        currentPoll: null,
        pollResults: {},
        pollHistory: [],
        chatMessages: []
      });
    }
    
    const session = sessions.get(sessionId);
    const user = {
      id: socket.id,
      name: userData.name,
      role: userData.role
    };
    
    session.users.push(user);
    
    // Notify others in the session
    socket.to(sessionId).emit('user-joined', user);
    socket.emit('session-data', session);
    
    console.log(`User ${userData.name} joined session ${sessionId}`);
  });

  // Create a new poll
  socket.on('create-poll', (sessionId, pollData) => {
    const session = sessions.get(sessionId);
    if (session) {
      session.currentPoll = {
        ...pollData,
        id: Date.now(),
        createdAt: new Date().toISOString()
      };
      session.pollResults = {};
      
      // Broadcast new poll to all users in session
      io.to(sessionId).emit('poll-created', session.currentPoll);
      console.log(`Poll created in session ${sessionId}: ${pollData.question}`);
    }
  });

  // Submit an answer
  socket.on('submit-answer', (sessionId, answerData) => {
    const session = sessions.get(sessionId);
    if (session && session.currentPoll) {
      const { optionIndex, userId } = answerData;
      
      // Update results
      session.pollResults[optionIndex] = (session.pollResults[optionIndex] || 0) + 1;
      
      // Broadcast updated results
      io.to(sessionId).emit('poll-results-updated', session.pollResults);
      console.log(`Answer submitted in session ${sessionId}: option ${optionIndex}`);
    }
  });

  // End current poll
  socket.on('end-poll', (sessionId) => {
    const session = sessions.get(sessionId);
    if (session && session.currentPoll) {
      // Add to history
      session.pollHistory.push({
        ...session.currentPoll,
        results: session.pollResults,
        endedAt: new Date().toISOString()
      });
      
      // Clear current poll
      session.currentPoll = null;
      session.pollResults = {};
      
      // Broadcast poll ended
      io.to(sessionId).emit('poll-ended', session.pollHistory);
      console.log(`Poll ended in session ${sessionId}`);
    }
  });

  // Send chat message
  socket.on('send-message', (sessionId, messageData) => {
    const session = sessions.get(sessionId);
    if (session) {
      const message = {
        id: Date.now(),
        user: messageData.user,
        message: messageData.message,
        timestamp: new Date().toISOString()
      };
      
      session.chatMessages.push(message);
      
      // Broadcast message to all users in session
      io.to(sessionId).emit('new-message', message);
      console.log(`Message sent in session ${sessionId}: ${messageData.message}`);
    }
  });

  // Kick a student
  socket.on('kick-student', (sessionId, studentId) => {
    const session = sessions.get(sessionId);
    if (session) {
      const userIndex = session.users.findIndex(u => u.id === studentId);
      if (userIndex !== -1) {
        const kickedUser = session.users.splice(userIndex, 1)[0];
        
        // Notify the kicked user
        io.to(studentId).emit('kicked-out');
        
        // Notify others in session
        socket.to(sessionId).emit('user-kicked', kickedUser);
        console.log(`User ${kickedUser.name} kicked from session ${sessionId}`);
      }
    }
  });

  // Get session data
  socket.on('get-session-data', (sessionId) => {
    const session = sessions.get(sessionId);
    if (session) {
      socket.emit('session-data', session);
    }
  });

  // Disconnect handling
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    
    // Remove user from all sessions
    sessions.forEach((session, sessionId) => {
      const userIndex = session.users.findIndex(u => u.id === socket.id);
      if (userIndex !== -1) {
        const disconnectedUser = session.users.splice(userIndex, 1)[0];
        socket.to(sessionId).emit('user-left', disconnectedUser);
        console.log(`User ${disconnectedUser.name} left session ${sessionId}`);
      }
    });
  });
});

// REST API endpoints
server.get('/api/sessions/:sessionId', (req, res) => {
  const sessionId = req.params.sessionId;
  const session = sessions.get(sessionId);
  
  if (session) {
    res.json(session);
  } else {
    res.status(404).json({ error: 'Session not found' });
  }
});

server.get('/api/sessions', (req, res) => {
  const sessionList = Array.from(sessions.keys()).map(sessionId => ({
    id: sessionId,
    userCount: sessions.get(sessionId).users.length,
    hasActivePoll: !!sessions.get(sessionId).currentPoll
  }));
  res.json(sessionList);
});

// Start the server immediately
const PORT = process.env.PORT || 3000;

httpServer.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🔗 Health check: http://localhost:${PORT}/health`);
  console.log(`🌐 Frontend: http://localhost:${PORT}`);
});

// Try to prepare Next.js, but don't block the server
app.prepare().then(() => {
  console.log('✅ Next.js prepared successfully');
  
  // Handle all other requests with Next.js
  server.all('*', (req, res) => {
    return handle(req, res);
  });
}).catch((err) => {
  console.error('❌ Next.js preparation failed:', err);
  console.log('⚠️  Server is running but Next.js frontend is not available');
  
  // Fallback for frontend routes
  server.all('*', (req, res) => {
    res.json({ 
      error: 'Frontend not available',
      message: 'The Next.js frontend failed to load, but the API is working',
      timestamp: new Date().toISOString()
    });
  });
}); 