#!/bin/bash

# PDF Expense Tracker Startup Script

echo "🚀 Starting PDF Expense Tracker..."

# Check if .env file exists
if [ ! -f .env ]; then
    echo "📝 Creating .env file..."
    cat > .env << EOL
# OpenAI API Configuration
OPENAI_API_KEY=your_openai_api_key_here

# Server Configuration  
PORT=3001

# Instructions:
# 1. Replace 'your_openai_api_key_here' with your actual OpenAI API key
# 2. Get your API key from: https://platform.openai.com/api-keys
# Example: OPENAI_API_KEY=sk-proj-abc123def456...
EOL
    echo "⚠️  Please edit .env file and add your OpenAI API key!"
    echo "   Get your API key from: https://platform.openai.com/api-keys"
    exit 1
fi

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

# Check if API key is set
if grep -q "your_openai_api_key_here" .env; then
    echo "⚠️  Please edit .env file and add your real OpenAI API key!"
    echo "   Get your API key from: https://platform.openai.com/api-keys"
    exit 1
fi

# Kill any existing server on port 3001
echo "🔄 Checking for existing server..."
lsof -ti:3001 | xargs kill -9 2>/dev/null || true

# Start the server
echo "🖥️  Starting backend server..."
npm start &

# Wait for server to start
sleep 3

# Open browser
if command -v open >/dev/null 2>&1; then
    echo "🌐 Opening browser..."
    open http://localhost:3001/expense-tracker.html
elif command -v xdg-open >/dev/null 2>&1; then
    echo "🌐 Opening browser..."
    xdg-open http://localhost:3001/expense-tracker.html
else
    echo "🌐 Server running at: http://localhost:3001/expense-tracker.html"
fi

echo "✅ PDF Expense Tracker is running!"
echo "   Frontend: http://localhost:3001/expense-tracker.html"
echo "   API: http://localhost:3001/api/health"
echo ""
echo "   Press Ctrl+C to stop the server"

# Keep script running
wait
