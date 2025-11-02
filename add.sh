#!/bin/bash

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -f "$SCRIPT_DIR/.env" ]; then
  set -a
  source "$SCRIPT_DIR/.env"
  set +a
fi

if [ -z "$1" ]; then
  echo "Usage: $0 \"task description\" [--priority level] [--due date] [--labels \"label1,label2\"]"
  exit 1
fi

CONTENT="$1"
shift

PRIORITY=""
DUE=""
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
  echo "Error: TODOIST_API_TOKEN environment variable not set"
  exit 1
fi

PROJECT_NAME="storybookai"
API_URL="https://api.todoist.com/rest/v2"

PROJECT_ID=$(curl -s -H "Authorization: Bearer $TODOIST_API_TOKEN" \
  "$API_URL/projects" | \
  jq -r ".[] | select(.name | ascii_downcase == \"$PROJECT_NAME\") | .id")

if [ -z "$PROJECT_ID" ]; then
  echo "Error: Project '$PROJECT_NAME' not found in Todoist"
  exit 1
fi

PAYLOAD=$(jq -n \
  --arg content "$CONTENT" \
  --arg project_id "$PROJECT_ID" \
  --arg priority "${PRIORITY:-1}" \
  --arg due_string "$DUE" \
  --arg description "$DESCRIPTION" \
  '{
    content: $content,
    project_id: $project_id,
    priority: ($priority | tonumber),
    description: $description,
    due_string: (if $due_string == "" then null else $due_string end)
  } | with_entries(select(.value != null and .value != ""))')

RESPONSE=$(curl -s -X POST \
  -H "Authorization: Bearer $TODOIST_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD" \
  "$API_URL/tasks")

TASK_ID=$(echo "$RESPONSE" | jq -r '.id')
TASK_CONTENT=$(echo "$RESPONSE" | jq -r '.content')
TASK_URL=$(echo "$RESPONSE" | jq -r '.url')

if [ "$TASK_ID" != "null" ] && [ -n "$TASK_ID" ]; then
  echo "✅ Task created successfully!"
  echo "  ID: $TASK_ID"
  echo "  Content: $TASK_CONTENT"
  echo "  URL: $TASK_URL"
else
  echo "❌ Error creating task:"
  echo "$RESPONSE" | jq '.'
  exit 1
fi

