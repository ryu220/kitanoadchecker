#!/bin/sh
set -e

echo "🚀 Starting up application..."

# Check if vector DB needs to be initialized
if [ "$SETUP_VECTOR_DB" = "true" ]; then
  echo "📦 Setting up vector database..."
  npm run setup:vector-db
  echo "✅ Vector DB setup complete!"
else
  echo "⏭️  Skipping vector DB setup (SETUP_VECTOR_DB not set to 'true')"
fi

# Start Next.js application
echo "🌐 Starting Next.js server..."
npm run start:prod
