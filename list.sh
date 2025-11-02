#!/bin/bash

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -f "$SCRIPT_DIR/.env" ]; then
  set -a
  source "$SCRIPT_DIR/.env"
  set +a
fi

SORT_BY="${1:-date}"
SORT_ORDER="${2:-desc}"
INCLUDE_COMPLETED="${3:-false}"
LIMIT="${4:-20}"

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

if [ "$INCLUDE_COMPLETED" != "true" ]; then
  TASKS=$(echo "$TASKS" | jq '[.[] | select(.completed == false or .completed == null)]')
fi

PRIORITY_MAP='{"1":"Normal","2":"High","3":"Very High","4":"Urgent"}'

echo "$TASKS" | jq -r --argjson priority_map "$PRIORITY_MAP" \
  --arg sort_by "$SORT_BY" \
  --arg sort_order "$SORT_ORDER" \
  --argjson limit "$LIMIT" '
  sort_by(if $sort_by == "priority" then .priority else 0 end, 
          if $sort_by == "date" then (.due.date // "9999-99-99") else "" end,
          if $sort_by == "created" then .created else "" end,
          if $sort_by == "content" then .content else "" end) |
  (if $sort_order == "desc" then reverse else . end) |
  .[0:$limit] |
  to_entries |
  .[] |
  "\(.key + 1). \(if .value.completed then "✅" else "" end)\(.value.content)\n" +
  "   ID: \(.value.id)\n" +
  "   Priority: \($priority_map[.value.priority | tostring] // "Normal")\n" +
  (if .value.due then "   Due: \(.value.due.string // .value.due.date)\n" else "   Due: No due date\n" end) +
  (if .value.description then "   Description: \(.value.description)\n" else "" end) +
  "   URL: \(.value.url)"
'

TASK_COUNT=$(echo "$TASKS" | jq 'length')
echo ""
echo "Total tasks: $TASK_COUNT"

