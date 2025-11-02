#!/bin/bash

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -f "$SCRIPT_DIR/.env" ]; then
  set -a
  source "$SCRIPT_DIR/.env"
  set +a
fi

if [ -z "$1" ]; then
  echo "Usage: $0 <task-id> [--priority level] [--due date] [--content \"text\"] [--labels \"label1,label2\"]"
  exit 1
fi

TASK_ID="$1"
shift

PRIORITY=""
DUE=""
CONTENT=""
LABELS=""
DESCRIPTION=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --priority|-p)
      PRIORITY="$2"
      shift 2
      ;;
    --due|-d)
      DUE="$2"
      shift 2
      ;;
    --content|-c)
      CONTENT="$2"
      shift 2
      ;;
    --labels|-l)
      LABELS="$2"
      shift 2
      ;;
    --description|--desc)
      DESCRIPTION="$2"
      shift 2
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

if [ -z "$TODOIST_API_TOKEN" ]; then
  echo "Error: TODOIST_API_TOKEN not set in .env file or environment variable"
  exit 1
fi

API_URL="https://api.todoist.com/rest/v2"

PAYLOAD=$(jq -n \
  --arg priority "$PRIORITY" \
  --arg due_string "$DUE" \
  --arg content "$CONTENT" \
  --arg description "$DESCRIPTION" \
  '{
    priority: (if $priority != "" then ($priority | tonumber) else empty end),
    due_string: (if $due_string != "" then $due_string else empty end),
    content: (if $content != "" then $content else empty end),
    description: (if $description != "" then $description else empty end)
  } | with_entries(select(.value != null and .value != ""))')

RESPONSE=$(curl -s -X POST \
  -H "Authorization: Bearer $TODOIST_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD" \
  "$API_URL/tasks/$TASK_ID")

TASK_ID_RESULT=$(echo "$RESPONSE" | jq -r '.id')

if [ "$TASK_ID_RESULT" != "null" ] && [ -n "$TASK_ID_RESULT" ]; then
  echo "✅ Task updated successfully!"
  echo "$RESPONSE" | jq '.'
else
  echo "❌ Error updating task:"
  echo "$RESPONSE" | jq '.' 2>/dev/null || echo "$RESPONSE"
  exit 1
fi

