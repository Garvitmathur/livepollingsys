import React, { useState, useEffect, useRef } from 'react';
import { Users, Clock, MessageCircle, Plus, X, Send, LogOut } from 'lucide-react';
import { io, Socket } from 'socket.io-client';

interface Poll {
  id: number;
  question: string;
  options: string[];
  timeLimit: number;
  createdAt: string;
  endedAt?: string;
  results?: Record<number, number>;
}

interface PollResult {
  [key: number]: number;
}

interface Student {
  id: number;
  name: string;
}

interface ConnectedUser {
  id: number;
  name: string;
  role: string;
}

interface ChatMessage {
  id: number;
  user: string;
  message: string;
  timestamp: string;
}

const LivePollingSystem = () => {
  const [currentView, setCurrentView] = useState('welcome');
  const [userRole, setUserRole] = useState<string | null>(null);
  const [studentName, setStudentName] = useState('');
  const [currentPoll, setCurrentPoll] = useState<Poll | null>(null);
  const [pollResults, setPollResults] = useState<PollResult>({});
  const [students, setStudents] = useState<Student[]>([]);
  const [timer, setTimer] = useState(0);
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [showChat, setShowChat] = useState(false);
  const [showParticipants, setShowParticipants] = useState(false);
  const [studentAnswer, setStudentAnswer] = useState<number | null>(null);
  const [hasAnswered, setHasAnswered] = useState(false);
  const [pollHistory, setPollHistory] = useState<Poll[]>([]);
  const [maxPollTime, setMaxPollTime] = useState(60);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const [sessionId, setSessionId] = useState('default-session');
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  // Real socket connection
  const [connectedUsers, setConnectedUsers] = useState<ConnectedUser[]>([]);

  useEffect(() => {
    if (isTimerRunning && timer > 0) {
      timerRef.current = setTimeout(() => {
        setTimer(timer - 1);
      }, 1000);
    } else if (timer === 0 && isTimerRunning) {
      setIsTimerRunning(false);
      if (userRole === 'student' && !hasAnswered) {
        setCurrentView('results');
      }
    }
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [timer, isTimerRunning, userRole, hasAnswered]);

  const handleRoleSelection = (role: string) => {
    setUserRole(role);
    if (role === 'teacher') {
      // Join as teacher
      if (socket) {
        socket.emit('join-session', sessionId, {
          name: 'Teacher',
          role: 'teacher'
        });
      }
      setCurrentView('teacher-dashboard');
    } else {
      setCurrentView('student-name');
    }
  };

  // Initialize socket connection
  useEffect(() => {
    // Only create socket if it doesn't exist
    if (socket) return;

    const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL || 
      (typeof window !== 'undefined' 
        ? 'http://localhost:4000'
        : 'http://localhost:4000');
    const newSocket = io(socketUrl, {
      transports: ['websocket', 'polling'],
      timeout: 20000,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });
    setSocket(newSocket);

    newSocket.on('connect', () => {
      setIsConnected(true);
      console.log('✅ Connected to server');
    });

    newSocket.on('disconnect', () => {
      setIsConnected(false);
      console.log('❌ Disconnected from server');
    });

    newSocket.on('connect_error', (error) => {
      console.error('❌ Connection error:', error);
      setIsConnected(false);
    });

    newSocket.on('session-data', (sessionData) => {
      setConnectedUsers(sessionData.users || []);
      setCurrentPoll(sessionData.currentPoll || null);
      setPollResults(sessionData.pollResults || {});
      setPollHistory(sessionData.pollHistory || []);
      setChatMessages(sessionData.chatMessages || []);
    });

    newSocket.on('poll-created', (poll) => {
      setCurrentPoll(poll);
      setPollResults({});
      setTimer(poll.timeLimit);
      setIsTimerRunning(true);
      setHasAnswered(false);
      setStudentAnswer(null);
      setCurrentView('active-poll');
    });

    newSocket.on('poll-results-updated', (results) => {
      setPollResults(results);
    });

    newSocket.on('poll-ended', (history) => {
      setPollHistory(history);
      setCurrentPoll(null);
      setPollResults({});
      setIsTimerRunning(false);
      setCurrentView(userRole === 'teacher' ? 'teacher-dashboard' : 'student-waiting');
    });

    newSocket.on('new-message', (message) => {
      setChatMessages(prev => [...prev, message]);
    });

    newSocket.on('user-joined', (user) => {
      setConnectedUsers(prev => [...prev, user]);
    });

    newSocket.on('user-left', (user) => {
      setConnectedUsers(prev => prev.filter(u => u.id !== user.id));
    });

    newSocket.on('user-kicked', (user) => {
      setConnectedUsers(prev => prev.filter(u => u.id !== user.id));
    });

    newSocket.on('kicked-out', () => {
      setCurrentView('kicked-out');
    });

    return () => {
      if (newSocket) {
        newSocket.close();
      }
    };
  }, [socket]);

  // Load student name from localStorage on component mount
  useEffect(() => {
    const savedName = localStorage.getItem('studentName');
    if (savedName) {
      setStudentName(savedName);
    }
  }, []);

  const handleStudentNameSubmit = () => {
    if (studentName.trim() && socket) {
      // Check if name already exists
      const existingStudent = connectedUsers.find(s => s.name.toLowerCase() === studentName.trim().toLowerCase());
      if (existingStudent) {
        alert('A student with this name already exists. Please choose a different name.');
        return;
      }
      
      // Save to localStorage
      localStorage.setItem('studentName', studentName.trim());
      
      // Join session via socket
      socket.emit('join-session', sessionId, {
        name: studentName.trim(),
        role: 'student'
      });
      
      setCurrentView('student-waiting');
    }
  };

  const createPoll = (question: string, options: string[], timeLimit: number = 60) => {
    if (socket) {
      socket.emit('create-poll', sessionId, {
      question,
      options,
        timeLimit
      });
    }
  };

  const submitAnswer = (optionIndex: number) => {
    if (hasAnswered || !socket) return;
    
    setStudentAnswer(optionIndex);
    setHasAnswered(true);
    
    // Submit answer via socket
    socket.emit('submit-answer', sessionId, {
      optionIndex,
      userId: socket.id
    });
    
    setCurrentView('results');
  };

  const endPoll = () => {
    if (socket) {
      socket.emit('end-poll', sessionId);
    }
  };

  const kickStudent = (studentId: string) => {
    if (socket) {
      socket.emit('kick-student', sessionId, studentId);
    }
  };

  const sendChatMessage = () => {
    if (chatInput.trim() && socket) {
      socket.emit('send-message', sessionId, {
        user: userRole === 'teacher' ? 'Teacher' : studentName,
        message: chatInput.trim()
      });
      setChatInput('');
    }
  };

  const WelcomeScreen = () => (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
      <div className="max-w-2xl w-full">
        <div className="text-center mb-8">
          <div className="inline-block bg-purple-600 text-white px-4 py-2 rounded-full mb-6">
            <span className="text-sm font-medium">⚡ Intervue Poll</span>
          </div>
          <h1 className="text-4xl font-bold text-white mb-4">
            Welcome to the <span className="text-purple-400">Live Polling System</span>
          </h1>
          <p className="text-gray-400 text-lg">
            Please select the role that best describes you to begin using the live polling system
          </p>
        </div>
        
        <div className="grid md:grid-cols-2 gap-6 mb-8">
          <div 
            className={`p-6 rounded-lg border-2 cursor-pointer transition-all ${
              userRole === 'student' 
                ? 'border-purple-500 bg-purple-50' 
                : 'border-gray-300 bg-white hover:border-purple-300'
            }`}
            onClick={() => handleRoleSelection('student')}
          >
            <h3 className="text-xl font-semibold text-gray-900 mb-3">I'm a Student</h3>
            <p className="text-gray-600">
              Submit answers, participate in live polls, and see how your responses compare with your classmates
            </p>
          </div>
          
          <div 
            className={`p-6 rounded-lg border-2 cursor-pointer transition-all ${
              userRole === 'teacher' 
                ? 'border-purple-500 bg-purple-50' 
                : 'border-gray-300 bg-white hover:border-purple-300'
            }`}
            onClick={() => handleRoleSelection('teacher')}
          >
            <h3 className="text-xl font-semibold text-gray-900 mb-3">I'm a Teacher</h3>
            <p className="text-gray-600">
              Create and manage polls, ask questions, and monitor your students' responses in real-time
            </p>
          </div>
        </div>
        
        <div className="text-center">
          <div className="mb-4">
            <div className={`inline-flex items-center px-3 py-1 rounded-full text-sm ${
              isConnected 
                ? 'bg-green-100 text-green-800' 
                : 'bg-red-100 text-red-800'
            }`}>
              <div className={`w-2 h-2 rounded-full mr-2 ${
                isConnected ? 'bg-green-500' : 'bg-red-500'
              }`}></div>
              {isConnected ? 'Connected' : 'Disconnected'}
            </div>
          </div>
          <button 
            onClick={() => {
              if (userRole) {
                if (userRole === 'teacher') {
                  setCurrentView('teacher-dashboard');
                } else {
                  setCurrentView('student-name');
                }
              }
            }}
            disabled={!userRole || !isConnected}
            className="bg-purple-600 text-white px-8 py-3 rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-purple-700 transition-colors"
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  );

  const StudentNameScreen = () => (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
      <div className="max-w-lg w-full">
        <div className="text-center mb-8">
          <div className="inline-block bg-purple-600 text-white px-4 py-2 rounded-full mb-6">
            <span className="text-sm font-medium">⚡ Intervue Poll</span>
          </div>
          <h1 className="text-4xl font-bold text-white mb-4">Let's Get Started</h1>
          <p className="text-gray-400 text-lg">
            If you're a student, you'll be able to <span className="text-white font-medium">submit your answers</span>, participate in live polls, and see how your responses compare with your classmates
          </p>
        </div>
        
        <div className="bg-white rounded-lg p-6">
          <label className="block text-gray-700 text-sm font-medium mb-4">
            Enter your Name
          </label>
          <input
            type="text"
            value={studentName}
            onChange={(e) => setStudentName(e.target.value)}
            className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
            placeholder="Enter your name"
            onKeyPress={(e) => e.key === 'Enter' && handleStudentNameSubmit()}
          />
        </div>
        
        <div className="text-center mt-6">
          <button 
            onClick={handleStudentNameSubmit}
            disabled={!studentName.trim()}
            className="bg-purple-600 text-white px-8 py-3 rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-purple-700 transition-colors"
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  );

  const TeacherDashboard = () => {
    const [newPoll, setNewPoll] = useState({
      question: '',
      options: ['', ''],
      timeLimit: 60
    });

    const addOption = () => {
      setNewPoll({
        ...newPoll,
        options: [...newPoll.options, '']
      });
    };

    const removeOption = (index: number) => {
      if (newPoll.options.length > 2) {
        const newOptions = newPoll.options.filter((_, i) => i !== index);
        setNewPoll({ ...newPoll, options: newOptions });
      }
    };

    const updateOption = (index: number, value: string) => {
      const newOptions = [...newPoll.options];
      newOptions[index] = value;
      setNewPoll({ ...newPoll, options: newOptions });
    };

    const handleCreatePoll = () => {
      if (newPoll.question.trim() && newPoll.options.every(opt => opt.trim())) {
        createPoll(newPoll.question, newPoll.options, newPoll.timeLimit);
        setNewPoll({ question: '', options: ['', ''], timeLimit: 60 });
      }
    };

    return (
      <div className="min-h-screen bg-gray-900 p-4">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-8">
            <div className="inline-block bg-purple-600 text-white px-4 py-2 rounded-full mb-6">
              <span className="text-sm font-medium">⚡ Intervue Poll</span>
            </div>
            <h1 className="text-4xl font-bold text-white mb-4">Let's Get Started</h1>
            <p className="text-gray-400 text-lg">
              You'll have the ability to create and manage polls, ask questions, and monitor your students' responses in real-time.
            </p>
          </div>

          <div className="bg-white rounded-lg p-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-semibold">Enter your question</h2>
              <select
                value={newPoll.timeLimit}
                onChange={(e) => setNewPoll({ ...newPoll, timeLimit: parseInt(e.target.value) })}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
              >
                <option value={30}>30 seconds</option>
                <option value={60}>60 seconds</option>
                <option value={120}>120 seconds</option>
                <option value={180}>180 seconds</option>
              </select>
            </div>

            <textarea
              value={newPoll.question}
              onChange={(e) => setNewPoll({ ...newPoll, question: e.target.value })}
              className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 mb-6"
              placeholder="Type your question here..."
              rows={3}
            />

            <div className="mb-6">
              <h3 className="text-lg font-medium mb-4">Edit Options</h3>
              {newPoll.options.map((option, index) => (
                <div key={index} className="flex items-center mb-3">
                  <div className="flex-shrink-0 w-8 h-8 bg-purple-600 text-white rounded-full flex items-center justify-center mr-3">
                    {index + 1}
                  </div>
                  <input
                    type="text"
                    value={option}
                    onChange={(e) => updateOption(index, e.target.value)}
                    className="flex-1 p-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                    placeholder={`Option ${index + 1}`}
                  />
                  {newPoll.options.length > 2 && (
                    <button
                      onClick={() => removeOption(index)}
                      className="ml-2 text-red-500 hover:text-red-700"
                    >
                      <X size={20} />
                    </button>
                  )}
                </div>
              ))}
              <button
                onClick={addOption}
                className="flex items-center text-purple-600 hover:text-purple-700 mt-2"
              >
                <Plus size={16} className="mr-1" />
                Add More option
              </button>
            </div>

            <div className="text-center">
              <button
                onClick={handleCreatePoll}
                disabled={!newPoll.question.trim() || !newPoll.options.every(opt => opt.trim())}
                className="bg-purple-600 text-white px-8 py-3 rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-purple-700 transition-colors"
              >
                Start Poll
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const StudentWaitingScreen = () => (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
      <div className="text-center">
        <div className="inline-block bg-purple-600 text-white px-4 py-2 rounded-full mb-6">
          <span className="text-sm font-medium">⚡ Intervue Poll</span>
        </div>
        <div className="w-16 h-16 border-4 border-purple-600 border-t-transparent rounded-full animate-spin mx-auto mb-6"></div>
        <h1 className="text-3xl font-bold text-white mb-4">
          Wait for the teacher to ask questions..
        </h1>
      </div>
      
      {/* Chat and Participants buttons */}
      <div className="fixed bottom-4 right-4 flex gap-2">
      <ChatButton />
        <ParticipantsButton />
      </div>
    </div>
  );

  const ActivePollScreen = () => {
    const totalVotes = Object.values(pollResults).reduce((sum: number, count: number) => sum + count, 0);
    
    return (
      <div className="min-h-screen bg-gray-900 p-4">
        <div className="max-w-4xl mx-auto">
          <div className="bg-white rounded-lg p-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-semibold">Question</h2>
              <div className="flex items-center gap-4">
                <div className="flex items-center text-gray-600">
                  <Clock size={16} className="mr-1" />
                  <span>{timer}s</span>
                </div>
                {userRole === 'teacher' && (
                  <button
                    onClick={endPoll}
                    className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors"
                  >
                    End Poll
                  </button>
                )}
              </div>
            </div>

            <div className="bg-gray-800 text-white p-4 rounded-lg mb-6">
              <h3 className="text-lg font-medium">{currentPoll?.question}</h3>
            </div>

            <div className="space-y-3">
              {currentPoll?.options.map((option, index) => {
                const votes = pollResults[index] || 0;
                const percentage = totalVotes > 0 ? (votes / totalVotes) * 100 : 0;
                
                return (
                  <div
                    key={index}
                    className={`relative p-4 rounded-lg border-2 cursor-pointer transition-all ${
                      userRole === 'student' && !hasAnswered
                        ? 'border-purple-300 hover:border-purple-500'
                        : 'border-gray-300'
                    } ${studentAnswer === index ? 'bg-purple-100 border-purple-500' : 'bg-white'}`}
                    onClick={() => userRole === 'student' && !hasAnswered && submitAnswer(index)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center">
                        <div className="w-8 h-8 bg-purple-600 text-white rounded-full flex items-center justify-center mr-3">
                          {index + 1}
                        </div>
                        <span className="font-medium">{option}</span>
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-semibold">{votes}</div>
                        <div className="text-sm text-gray-500">{percentage.toFixed(1)}%</div>
                      </div>
                    </div>
                    {percentage > 0 && (
                      <div className="absolute bottom-0 left-0 h-1 bg-purple-600 rounded-b-lg" 
                           style={{ width: `${percentage}%` }}></div>
                    )}
                  </div>
                );
              })}
            </div>

            {userRole === 'teacher' && (
              <div className="mt-6 text-center">
                <button
                  onClick={() => setCurrentView('teacher-dashboard')}
                  disabled={isTimerRunning}
                  className="bg-purple-600 text-white px-6 py-2 rounded-lg hover:bg-purple-700 transition-colors mr-4 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  + Ask a new question
                </button>
                <button
                  onClick={() => setCurrentView('poll-history')}
                  className="bg-gray-600 text-white px-6 py-2 rounded-lg hover:bg-gray-700 transition-colors"
                >
                  View History
                </button>
              </div>
            )}
          </div>
        </div>
        
        <div className="fixed bottom-4 right-4 flex gap-2">
          <ChatButton />
          <ParticipantsButton />
        </div>
      </div>
    );
  };

  const ResultsScreen = () => {
    const totalVotes = Object.values(pollResults).reduce((sum, count) => sum + count, 0);
    
    return (
      <div className="min-h-screen bg-gray-900 p-4">
        <div className="max-w-4xl mx-auto">
          <div className="bg-white rounded-lg p-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-semibold">Poll Results</h2>
              <div className="text-gray-600">
                Total Responses: {totalVotes}
              </div>
            </div>

            <div className="bg-gray-800 text-white p-4 rounded-lg mb-6">
              <h3 className="text-lg font-medium">{currentPoll?.question}</h3>
            </div>

            <div className="space-y-3">
              {currentPoll?.options.map((option, index) => {
                const votes = pollResults[index] || 0;
                const percentage = totalVotes > 0 ? (votes / totalVotes) * 100 : 0;
                
                return (
                  <div
                    key={index}
                    className={`relative p-4 rounded-lg border-2 ${
                      studentAnswer === index ? 'bg-purple-100 border-purple-500' : 'bg-white border-gray-300'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center">
                        <div className="w-8 h-8 bg-purple-600 text-white rounded-full flex items-center justify-center mr-3">
                          {index + 1}
                        </div>
                        <span className="font-medium">{option}</span>
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-semibold">{votes}</div>
                        <div className="text-sm text-gray-500">{percentage.toFixed(1)}%</div>
                      </div>
                    </div>
                    {percentage > 0 && (
                      <div className="absolute bottom-0 left-0 h-1 bg-purple-600 rounded-b-lg" 
                           style={{ width: `${percentage}%` }}></div>
                    )}
                  </div>
                );
              })}
            </div>

            {userRole === 'teacher' && (
              <div className="mt-6 text-center">
                <button
                  onClick={() => setCurrentView('teacher-dashboard')}
                  disabled={isTimerRunning}
                  className="bg-purple-600 text-white px-6 py-2 rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  + Ask a new question
                </button>
              </div>
            )}
          </div>
        </div>
        
        <div className="fixed bottom-4 right-4 flex gap-2">
          <ChatButton />
          <ParticipantsButton />
        </div>
      </div>
    );
  };

  const ChatButton = () => (
    <button
      onClick={() => setShowChat(!showChat)}
      className="w-12 h-12 bg-purple-600 text-white rounded-full flex items-center justify-center hover:bg-purple-700 transition-colors shadow-lg relative"
    >
      <MessageCircle size={24} />
      {chatMessages.length > 0 && (
        <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
          {chatMessages.length}
        </span>
      )}
    </button>
  );

  const ParticipantsButton = () => (
    <button
      onClick={() => setShowParticipants(!showParticipants)}
      className="w-12 h-12 bg-purple-600 text-white rounded-full flex items-center justify-center hover:bg-purple-700 transition-colors shadow-lg relative"
    >
      <Users size={24} />
      {connectedUsers.length > 0 && (
        <span className="absolute -top-1 -right-1 bg-green-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
          {connectedUsers.length}
        </span>
      )}
    </button>
  );

  const ChatPopup = () => (
    <div className="fixed bottom-20 right-4 w-80 h-96 bg-white rounded-lg shadow-xl border">
      <div className="flex justify-between items-center p-4 border-b">
        <h3 className="font-semibold">Chat</h3>
        <button onClick={() => setShowChat(false)}>
          <X size={20} />
        </button>
      </div>
      <div className="h-64 overflow-y-auto p-4">
        {chatMessages.map((msg) => (
          <div key={msg.id} className="mb-3">
            <div className="flex justify-between items-start">
              <span className="font-medium text-sm text-purple-600">{msg.user}</span>
              <span className="text-xs text-gray-500">
                {new Date(msg.timestamp).toLocaleTimeString()}
              </span>
            </div>
            <p className="text-sm text-gray-700 mt-1">{msg.message}</p>
          </div>
        ))}
      </div>
      <div className="p-4 border-t">
        <div className="flex gap-2">
          <input
            type="text"
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && sendChatMessage()}
            placeholder="Type a message..."
            className="flex-1 p-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
          <button
            onClick={sendChatMessage}
            className="bg-purple-600 text-white p-2 rounded-lg hover:bg-purple-700 transition-colors"
          >
            <Send size={16} />
          </button>
        </div>
      </div>
    </div>
  );

  const ParticipantsPopup = () => (
    <div className="fixed bottom-20 right-4 w-80 bg-white rounded-lg shadow-xl border">
      <div className="flex justify-between items-center p-4 border-b">
        <h3 className="font-semibold">Participants</h3>
        <button onClick={() => setShowParticipants(false)}>
          <X size={20} />
        </button>
      </div>
      <div className="p-4">
        <div className="flex justify-between items-center mb-4 text-sm text-gray-600">
          <span>Name</span>
          <span>Action</span>
        </div>
        {connectedUsers.map((user) => (
          <div key={user.id} className="flex justify-between items-center py-2">
            <span className="font-medium">{user.name}</span>
            {userRole === 'teacher' && (
              <button
                onClick={() => kickStudent(user.id.toString())}
                className="text-blue-600 hover:text-blue-800 text-sm"
              >
                Kick out
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );

  const PollHistoryScreen = () => (
    <div className="min-h-screen bg-gray-900 p-4">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-8">
          <div className="inline-block bg-purple-600 text-white px-4 py-2 rounded-full mb-6">
            <span className="text-sm font-medium">⚡ Intervue Poll</span>
          </div>
          <h1 className="text-4xl font-bold text-white mb-4">Poll History</h1>
          <p className="text-gray-400 text-lg">
            View all previous polls and their results
          </p>
        </div>

        <div className="bg-white rounded-lg p-6">
          {pollHistory.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-500 text-lg">No polls have been created yet.</p>
            </div>
          ) : (
            <div className="space-y-6">
              {pollHistory.map((poll, index) => {
                const totalVotes = poll.results ? Object.values(poll.results).reduce((sum: number, count: number) => sum + count, 0) : 0;
                
                return (
                  <div key={poll.id} className="border border-gray-200 rounded-lg p-4">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <h3 className="text-lg font-semibold">{poll.question}</h3>
                        <p className="text-sm text-gray-500">
                          Created: {new Date(poll.createdAt).toLocaleString()}
                        </p>
                        {poll.endedAt && (
                          <p className="text-sm text-gray-500">
                            Ended: {new Date(poll.endedAt).toLocaleString()}
                          </p>
                        )}
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-semibold">{totalVotes}</div>
                        <div className="text-sm text-gray-500">Total Responses</div>
                      </div>
                    </div>

                    <div className="space-y-2">
                      {poll.options.map((option, optionIndex) => {
                        const votes = poll.results?.[optionIndex] || 0;
                        const percentage = totalVotes > 0 ? (votes / totalVotes) * 100 : 0;
                        
                        return (
                          <div key={optionIndex} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                            <div className="flex items-center">
                              <div className="w-6 h-6 bg-purple-600 text-white rounded-full flex items-center justify-center mr-3 text-sm">
                                {optionIndex + 1}
                              </div>
                              <span className="font-medium">{option}</span>
                            </div>
                            <div className="text-right">
                              <div className="font-semibold">{votes}</div>
                              <div className="text-sm text-gray-500">{percentage.toFixed(1)}%</div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="text-center mt-6">
          <button
            onClick={() => setCurrentView('teacher-dashboard')}
            className="bg-purple-600 text-white px-6 py-2 rounded-lg hover:bg-purple-700 transition-colors"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    </div>
  );

  const KickedOutScreen = () => (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
      <div className="text-center">
        <div className="inline-block bg-purple-600 text-white px-4 py-2 rounded-full mb-6">
          <span className="text-sm font-medium">⚡ Intervue Poll</span>
        </div>
        <h1 className="text-3xl font-bold text-white mb-4">
          You've been Kicked out !
        </h1>
        <p className="text-gray-400 text-lg mb-6">
          Looks like the teacher had removed you from the poll system. Please try again sometime.
        </p>
      </div>
    </div>
  );

  // Simulate real-time updates
  useEffect(() => {
    // Simulate new poll creation for students
    if (userRole === 'student' && currentView === 'student-waiting') {
      const pollTimeout = setTimeout(() => {
        const samplePoll: Poll = {
          id: Date.now(),
          question: "Which planet is known as the Red Planet?",
          options: ["Mars", "Venus", "Jupiter", "Saturn"],
          timeLimit: 60,
          createdAt: new Date().toISOString()
        };
        setCurrentPoll(samplePoll);
        setTimer(60);
        setIsTimerRunning(true);
        setCurrentView('active-poll');
      }, 3000);
      
      return () => clearTimeout(pollTimeout);
    }
  }, [userRole, currentView]);

  // Render appropriate screen based on current view
  const renderScreen = () => {
    switch (currentView) {
      case 'welcome':
        return <WelcomeScreen />;
      case 'student-name':
        return <StudentNameScreen />;
      case 'teacher-dashboard':
        return <TeacherDashboard />;
      case 'student-waiting':
        return <StudentWaitingScreen />;
      case 'active-poll':
        return <ActivePollScreen />;
      case 'results':
        return <ResultsScreen />;
      case 'poll-history':
        return <PollHistoryScreen />;
      case 'kicked-out':
        return <KickedOutScreen />;
      default:
        return <WelcomeScreen />;
    }
  };

  return (
    <div className="relative">
      {renderScreen()}
      {showChat && <ChatPopup />}
      {showParticipants && <ParticipantsPopup />}
    </div>
  );
};

export default LivePollingSystem;