#!/bin/bash

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -f "$SCRIPT_DIR/.env" ]; then
  set -a
  source "$SCRIPT_DIR/.env"
  set +a
fi

if [ -z "$1" ]; then
  echo "Usage: $0 \"search query\" [limit]"
  exit 1
fi

QUERY="$1"
LIMIT="${2:-10}"

if [ -z "$TODOIST_API_TOKEN" ]; then
  echo "Error: TODOIST_API_TOKEN not set in .env file or environment variable"
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

TASKS=$(curl -s -H "Authorization: Bearer $TODOIST_API_TOKEN" \
  "$API_URL/tasks?project_id=$PROJECT_ID")

QUERY_LOWER=$(echo "$QUERY" | tr '[:upper:]' '[:lower:]')

MATCHES=$(echo "$TASKS" | jq --arg query "$QUERY_LOWER" --argjson limit "$LIMIT" '
  [.[] | select(
    (.content | ascii_downcase | contains($query)) or
    (.description // "" | ascii_downcase | contains($query))
  )] | .[0:$limit]
')

MATCH_COUNT=$(echo "$MATCHES" | jq 'length')

if [ "$MATCH_COUNT" -eq 0 ]; then
  echo "🔍 No tasks found matching \"$QUERY\""
  exit 0
fi

PRIORITY_MAP='{"1":"Normal","2":"High","3":"Very High","4":"Urgent"}'

echo "🔍 Found $MATCH_COUNT task(s) matching \"$QUERY\":"
echo ""
echo "$MATCHES" | jq -r --argjson priority_map "$PRIORITY_MAP" '
  to_entries |
  .[] |
  "\(.key + 1). \(if .value.completed then "✅" else "" end)\(.value.content)\n" +
  "   ID: \(.value.id)\n" +
  "   Priority: \($priority_map[.value.priority | tostring] // "Normal")\n" +
  (if .value.due then "   Due: \(.value.due.string // .value.due.date)\n" else "   Due: No due date\n" end) +
  (if .value.description then "   Description: \(.value.description)\n" else "" end) +
  "   URL: \(.value.url)\n"
'

