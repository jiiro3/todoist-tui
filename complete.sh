#!/bin/bash

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -f "$SCRIPT_DIR/.env" ]; then
  set -a
  source "$SCRIPT_DIR/.env"
  set +a
fi

if [ -z "$1" ]; then
  echo "Usage: $0 <task-id>"
  exit 1
fi

TASK_ID="$1"

if [ -z "$TODOIST_API_TOKEN" ]; then
  echo "Error: TODOIST_API_TOKEN not set in .env file or environment variable"
  exit 1
fi

API_URL="https://api.todoist.com/rest/v2"

RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
  -H "Authorization: Bearer $TODOIST_API_TOKEN" \
  "$API_URL/tasks/$TASK_ID/close")

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" -eq 204 ] || [ "$HTTP_CODE" -eq 200 ]; then
  echo "✅ Task $TASK_ID marked as completed!"
else
  echo "❌ Error completing task:"
  echo "HTTP Code: $HTTP_CODE"
  echo "$BODY" | jq '.' 2>/dev/null || echo "$BODY"
  exit 1
fi

