#!/bin/bash

# Launch TUI with automatic window focus or print tasks
# Resolve symlink to get real script location
SOURCE="${BASH_SOURCE[0]}"
while [ -h "$SOURCE" ]; do
  SCRIPT_DIR="$(cd -P "$(dirname "$SOURCE")" && pwd)"
  SOURCE="$(readlink "$SOURCE")"
  [[ $SOURCE != /* ]] && SOURCE="$SCRIPT_DIR/$SOURCE"
done
SCRIPT_DIR="$(cd -P "$(dirname "$SOURCE")" && pwd)"

# Parse flags
PRINT_MODE=false
DETAILS_MODE=false
ADD_MODE=false
ARGS=()

while [[ $# -gt 0 ]]; do
  case $1 in
    -p|--print)
      PRINT_MODE=true
      shift
      ;;
    -d|--details)
      DETAILS_MODE=true
      shift
      ;;
    -a|--add)
      ADD_MODE=true
      shift
      # Rest of arguments are the task content
      TASK_CONTENT="$*"
      break
      ;;
    -h|--help)
      echo "Usage: todo [OPTIONS] [SEARCH_TERMS|TASK_IDS]"
      echo ""
      echo "Options:"
      echo "  -p, --print     Print tasks instead of opening TUI"
      echo "  -d, --details   Show full details (use with -p)"
      echo "  -a, --add       Quickly add a task"
      echo "  -h, --help      Show this help"
      echo ""
      echo "Examples:"
      echo "  todo                    # Open TUI with all tasks"
      echo "  todo story design       # Search and open in TUI"
      echo "  todo -p story design    # Search and print results"
      echo "  todo -p -d story        # Print with full details"
      echo "  todo -a Fix the bug     # Quickly add a task"
      exit 0
      ;;
    *)
      ARGS+=("$1")
      shift
      ;;
  esac
done

# Handle add mode
if [ "$ADD_MODE" = true ]; then
  if [ -z "$TASK_CONTENT" ]; then
    echo "Error: No task content provided"
    echo "Usage: todo -a <task content>"
    exit 1
  fi

  "$SCRIPT_DIR/add.sh" "$TASK_CONTENT"
  exit $?
fi

# Function to search tasks (phrase-based search)
search_tasks() {
  local query="$1"

  # Search for the exact phrase
  "$SCRIPT_DIR/search.sh" "$query" 100 2>/dev/null | grep 'ID:' | awk '{print $2}' | xargs
}

# Determine what to show
if [ ${#ARGS[@]} -gt 0 ]; then
  # Check if all arguments are numeric (task IDs)
  ALL_NUMERIC=true
  for arg in "${ARGS[@]}"; do
    if ! [[ "$arg" =~ ^[0-9]+$ ]]; then
      ALL_NUMERIC=false
      break
    fi
  done

  if [ "$ALL_NUMERIC" = false ]; then
    # Treat as search query
    SEARCH_QUERY="${ARGS[*]}"
    TASK_IDS=$(search_tasks "$SEARCH_QUERY")

    if [ -z "$TASK_IDS" ]; then
      echo "No tasks found matching: $SEARCH_QUERY"
      exit 1
    fi
  else
    # All numeric, treat as task IDs
    TASK_IDS="${ARGS[*]}"
  fi
else
  # No arguments - show all tasks
  TASK_IDS=""
fi

# Print mode
if [ "$PRINT_MODE" = true ]; then
  source "$SCRIPT_DIR/.env"

  if [ -z "$TASK_IDS" ]; then
    # Get all tasks
    TASK_JSON=$(curl -s -H "Authorization: Bearer $TODOIST_API_TOKEN" \
      "https://api.todoist.com/rest/v2/tasks?project_id=2348430127")
    TASK_IDS=$(echo "$TASK_JSON" | jq -r '.[] | select(.is_completed == false) | .id' | xargs)
  fi

  if [ "$DETAILS_MODE" = true ]; then
    # Full details mode
    for task_id in $TASK_IDS; do
      TASK_JSON=$(curl -s -H "Authorization: Bearer $TODOIST_API_TOKEN" \
        "https://api.todoist.com/rest/v2/tasks/$task_id")

      echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
      echo "$TASK_JSON" | jq -r '
        "ID: \(.id)",
        "Content: \(.content)",
        "Priority: \(if .priority == 4 then "🔥 Urgent" elif .priority == 3 then "⚡ Very High" elif .priority == 2 then "🔴 High" else "○ Normal" end)",
        "Due: \(.due.string // .due.date // "No due date")",
        "Labels: \(if .labels | length > 0 then (.labels | join(", ")) else "None" end)",
        "Created: \(.created_at)",
        (if .description then "Description: \(.description)" else "" end),
        "URL: \(.url)"
      '
      echo ""
    done
  else
    # Minimal single-line format
    for task_id in $TASK_IDS; do
      TASK_JSON=$(curl -s -H "Authorization: Bearer $TODOIST_API_TOKEN" \
        "https://api.todoist.com/rest/v2/tasks/$task_id")

      echo "$TASK_JSON" | jq -r '
        (if .priority == 4 then "🔥" elif .priority == 3 then "⚡" elif .priority == 2 then "🔴" else "○" end) + " " +
        (.id | tostring) + " - " +
        .content +
        (if .due then " (due: " + (.due.string // .due.date) + ")" else "" end)
      '
    done
  fi
  exit 0
fi

# Close any existing Todoist TUI windows
wmctrl -c "Todoist Tasks TUI" 2>/dev/null || true

# Interactive TUI mode
if [ -n "$TASK_IDS" ]; then
  if [ -n "$SEARCH_QUERY" ]; then
    # Launch with search query in title
    DISPLAY=:1 gnome-terminal --title "Todoist Tasks TUI - Search: $SEARCH_QUERY" -- bash -c "$SCRIPT_DIR/tui.sh $TASK_IDS" &
  else
    # Launch with specific task IDs
    DISPLAY=:1 gnome-terminal --title "Todoist Tasks TUI" -- bash -c "$SCRIPT_DIR/tui.sh $TASK_IDS" &
  fi
else
  # Launch with all tasks
  DISPLAY=:1 gnome-terminal --title "Todoist Tasks TUI" -- bash -c "$SCRIPT_DIR/tui.sh" &
fi

# Wait for window to appear and focus it
(
  # Give window time to fully initialize
  sleep 0.8

  # Try multiple times with different patterns
  for i in {1..3}; do
    wmctrl -a "Todoist Tasks TUI" 2>/dev/null && break
    wmctrl -a "Todoist" 2>/dev/null && break
    sleep 0.2
  done
) &
