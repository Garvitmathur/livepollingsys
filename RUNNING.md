# How to Run the Live Polling System

## Quick Start

### 1. Install Dependencies
```bash
# Install frontend dependencies
npm install

# Install backend dependencies
cd backend
npm install
cd ..
```

### 2. Start the Backend Server
```bash
cd backend
npm run dev
```
The backend will start on `http://localhost:3001`

### 3. Start the Frontend
```bash
# In a new terminal, from the root directory
npm run dev
```
The frontend will start on `http://localhost:3000`

## What's Working Now

✅ **Real-time Socket.io Backend**
- Handles multiple users in sessions
- Real-time poll creation and voting
- Live chat functionality
- User management (join/leave/kick)

✅ **Frontend Features**
- Teacher can create polls with custom questions
- Students can join and vote
- Real-time results display
- Chat system with message notifications
- Participants list with user count
- Poll history view
- Connection status indicator

✅ **Styling**
- Tailwind CSS properly configured
- Responsive design
- Modern UI with animations

## Testing the System

1. **Open two browser tabs** to `http://localhost:3000`

2. **In the first tab:**
   - Select "I'm a Teacher"
   - Create a poll with a question and options
   - Set a time limit
   - Click "Start Poll"

3. **In the second tab:**
   - Select "I'm a Student"
   - Enter your name
   - You should see the poll appear automatically
   - Vote on an option
   - Use the chat and participants buttons

## Troubleshooting

### If CSS is not working:
- Make sure Tailwind CSS is installed: `npm install -D tailwindcss autoprefixer postcss`
- Restart the development server

### If socket connection fails:
- Check that the backend is running on port 3001
- Look for connection status indicator on the welcome screen
- Check browser console for error messages

### If buttons don't work:
- Make sure you're connected (green indicator on welcome screen)
- Try refreshing the page
- Check browser console for errors

## Deployment

For production deployment, see the main README.md file for options including:
- Vercel
- Netlify  
- Docker
- Heroku 