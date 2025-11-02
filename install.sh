#!/bin/bash

set -e

echo "🚀 Installing Todoist TUI..."
echo ""

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Install Node.js dependencies
echo "📦 Installing Node.js dependencies..."
npm install

# Make scripts executable
echo "🔧 Making scripts executable..."
chmod +x "$SCRIPT_DIR"/*.sh

# Set up .env file if it doesn't exist
if [ ! -f "$SCRIPT_DIR/.env" ]; then
  echo ""
  echo "🔑 Setting up API token..."

  if [ -f "$SCRIPT_DIR/.env.example" ]; then
    cp "$SCRIPT_DIR/.env.example" "$SCRIPT_DIR/.env"
  fi

  echo ""
  echo "Please enter your Todoist API token."
  echo "Get it from: https://todoist.com/prefs/integrations"
  read -p "API Token: " api_token

  if [ -n "$api_token" ]; then
    echo "TODOIST_API_TOKEN=$api_token" > "$SCRIPT_DIR/.env"
    echo "✅ API token saved!"
  else
    echo "⚠️  No token provided. You'll need to add it manually to .env"
  fi
else
  echo "✅ .env file already exists"
fi

# Create symlink for global access
echo ""
read -p "Create global 'todo' command? (requires sudo) [y/N]: " create_symlink

if [[ "$create_symlink" =~ ^[Yy]$ ]]; then
  echo "🔗 Creating symlink..."
  sudo ln -sf "$SCRIPT_DIR/show-tui.sh" /usr/local/bin/todo
  echo "✅ Global 'todo' command created!"
else
  echo "⏭️  Skipping symlink. Run './show-tui.sh' to use the tool."
fi

echo ""
echo "✨ Installation complete!"
echo ""
echo "Usage:"
echo "  todo              # Open TUI with all tasks"
echo "  todo -p           # Print tasks"
echo "  todo -a Task      # Add a task"
echo "  todo -h           # Show help"
echo ""
echo "Press 's' in the TUI to configure sorting"
echo "Press ',' in the TUI to change project settings"
echo ""
