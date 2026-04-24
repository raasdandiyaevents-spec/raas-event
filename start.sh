#!/bin/bash
# RAAS DANDIYA Event System - Complete Startup Script

echo "╔════════════════════════════════════════════════════════════╗"
echo "║      RAAS DANDIYA Event Ticketing System - Startup         ║"
echo "║                    Production Ready v1.0                  ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js first."
    exit 1
fi

echo "✓ Node.js version: $(node -v)"
echo ""

# Check if .env file exists
if [ ! -f ".env" ]; then
    echo "⚠️  .env file not found!"
    echo "📋 Creating .env from .env.example..."
    
    if [ -f ".env.example" ]; then
        cp .env.example .env
        echo "✓ .env created from template"
        echo ""
        echo "⚠️  IMPORTANT: Please edit .env with your Cashfree sandbox credentials:"
        echo "   - CLIENT_ID"
        echo "   - CLIENT_SECRET"
        echo ""
        echo "   Get these from: https://dashboard.cashfree.com"
        echo ""
    else
        echo "❌ .env.example not found"
        exit 1
    fi
fi

# Install dependencies if node_modules doesn't exist
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
    echo "✓ Dependencies installed"
    echo ""
fi

# Start the payment server
echo "🚀 Starting Payment Server..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Server will run on: http://localhost:3000"
echo ""
echo "IMPORTANT:"
echo "1. Keep this terminal open"
echo "2. Open another terminal window"
echo "3. Start frontend: python -m http.server 5500"
echo "4. Access app: http://localhost:5500"
echo ""
echo "Test Card: 4111111111111111"
echo "OTP: Any 6 digits"
echo ""
echo "Press Ctrl+C to stop the server"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

npm start
