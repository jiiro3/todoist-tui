#!/bin/bash

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Run the TUI with any task IDs passed as arguments
node "$SCRIPT_DIR/tui.js" "$@"
