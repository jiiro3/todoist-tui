# Todoist TUI

A fast, keyboard-driven Terminal User Interface for managing Todoist tasks.

![Todoist TUI Screenshot](screenshot.png)

## Features

- **Keyboard-driven workflow** - Vi keybindings (hjkl) and arrow keys
- **Interactive TUI** - Beautiful terminal interface built with blessed
- **Sorting** - Sort by priority, due date, or creation date
- **Quick actions** - Add, edit, complete tasks without leaving the terminal
- **Search** - Filter tasks by search terms
- **Print mode** - Quick list view for scripting and piping
- **Configurable** - Set default project and sort preferences
- **Fast** - Optimistic UI updates for instant feedback

## Installation

### Prerequisites

- Node.js (v14 or higher)
- curl
- wmctrl (for auto-focus on Linux)

### Install

```bash
# Clone the repository
git clone https://github.com/yourusername/todoist-tui.git
cd todoist-tui

# Run the install script
./install.sh
```

This will:
1. Install Node.js dependencies
2. Set up your Todoist API token
3. Create a global `todo` command

### Manual Installation

```bash
# Install dependencies
npm install

# Copy and configure your API token
cp .env.example .env
# Edit .env and add your Todoist API token

# Make scripts executable
chmod +x *.sh

# Create symlink (optional, for global access)
sudo ln -s "$(pwd)/show-tui.sh" /usr/local/bin/todo
```

### Get Your Todoist API Token

1. Go to [Todoist Settings → Integrations](https://todoist.com/prefs/integrations)
2. Scroll to "API token"
3. Copy your token and paste it in the `.env` file

## Usage

### Interactive TUI Mode

```bash
# Open TUI with all tasks
todo

# Search and open TUI with filtered tasks
todo story design

# Open specific tasks by ID
todo 123456789 987654321
```

### Print Mode

```bash
# Print tasks (minimal, one-line format)
todo -p

# Print with full details
todo -p -d

# Search and print
todo -p story design
```

### Quick Add

```bash
# Quickly add a task
todo -a Fix the login bug
```

## Keybindings

### Navigation
- `↑↓` or `j/k` - Navigate tasks
- `h/l` - Vi horizontal navigation (where applicable)

### Actions
- `Enter` or `Space` - Toggle task completion
- `Tab` - View task details
- `a` - Add new task
- `e` - Edit task content
- `p` - Change task priority
- `d` - Set due date
- `s` - Sort tasks
- `,` - Settings
- `q` or `Esc` - Quit

### Sort Options (press `s`)
- `n` - None (default order)
- `p` - Priority (high to low)
- `d` - Due date (soonest first)
- `c` - Created date (newest first)

## Configuration

Settings are stored in `~/.config/todoist-tui/config` as JSON:

```json
{
  "project": "Inbox",
  "sortBy": "priority"
}
```

You can change these via the Settings menu (press `,`) or edit the file directly.

## Examples

```bash
# Morning workflow - check high priority tasks
todo -p -d | grep "🔥"

# Add a task
todo -a "Review pull requests"

# Search for specific tasks
todo bug fix

# Quick view of today's tasks
todo -p | grep "today"
```

## Priority Indicators

- 🔥 (●) - Urgent (Priority 4)
- ⚡ (◑) - Very High (Priority 3)
- 🔴 (◐) - High (Priority 2)
- ○ - Normal (Priority 1)

## Command-line Flags

- `-p, --print` - Print tasks instead of opening TUI
- `-d, --details` - Show full details (use with -p)
- `-a, --add` - Quickly add a task
- `-h, --help` - Show help message

## Development

```bash
# Run directly
./show-tui.sh

# Or via the TUI script
./tui.sh

# Test individual scripts
./list.sh
./search.sh "keyword"
./add.sh "Task content" --priority 3
```

## Project Structure

```
todoist-tui/
├── tui.js           # Main TUI application (Node.js + blessed)
├── tui.sh           # TUI wrapper script
├── show-tui.sh      # Main entry point with flag parsing
├── list.sh          # List all tasks
├── search.sh        # Search tasks
├── add.sh           # Add new task
├── complete.sh      # Complete a task
├── update.sh        # Update task fields
├── package.json     # Node.js dependencies
├── .env.example     # API token template
└── README.md        # This file
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT License - see LICENSE file for details

## Acknowledgments

- Built with [blessed](https://github.com/chjj/blessed) - Terminal UI framework
- Powered by [Todoist API](https://developer.todoist.com/)
