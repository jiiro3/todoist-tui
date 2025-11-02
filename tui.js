#!/usr/bin/env node

const blessed = require('blessed');
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const SCRIPT_DIR = __dirname;
const CONFIG_DIR = path.join(os.homedir(), '.config', 'todoist-tui');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config');

// Priority mapping
const PRIORITY_MAP = {
  1: { name: 'Normal', symbol: '○', color: 'white' },
  2: { name: 'High', symbol: '◐', color: 'yellow' },
  3: { name: 'Very High', symbol: '◑', color: 'magenta' },
  4: { name: 'Urgent', symbol: '●', color: 'red' }
};

// Config defaults
let config = {
  project: 'storybookai',
  sortBy: 'none' // none, priority, due_date, created
};

let tasks = [];
let allTasks = []; // Store all tasks for filtering
let currentFilter = '';
let selectedIndex = 0;

// Load config from file
function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const data = fs.readFileSync(CONFIG_FILE, 'utf8');
      const loaded = JSON.parse(data);
      config = { ...config, ...loaded };
    }
  } catch (e) {
    // Use defaults if config can't be loaded
  }
}

// Save config to file
function saveConfig() {
  try {
    if (!fs.existsSync(CONFIG_DIR)) {
      fs.mkdirSync(CONFIG_DIR, { recursive: true });
    }
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
  } catch (e) {
    console.error('Failed to save config:', e.message);
  }
}

// Sort tasks based on current sort setting
function sortTasks() {
  if (config.sortBy === 'none') return;

  tasks.sort((a, b) => {
    switch (config.sortBy) {
      case 'priority':
        return b.priority - a.priority; // Higher priority first
      case 'due_date':
        if (!a.due && !b.due) return 0;
        if (!a.due) return 1;
        if (!b.due) return -1;
        return new Date(a.due.date) - new Date(b.due.date);
      case 'created':
        return new Date(b.created_at) - new Date(a.created_at); // Newest first
      default:
        return 0;
    }
  });
}

// Try to read tasks from stdin first
function readStdin() {
  return new Promise((resolve) => {
    if (process.stdin.isTTY) {
      // No stdin piped, return null
      resolve(null);
      return;
    }

    let input = '';
    process.stdin.setEncoding('utf8');

    const timeout = setTimeout(() => {
      resolve(null);
    }, 100);

    process.stdin.on('data', (chunk) => {
      clearTimeout(timeout);
      input += chunk;
    });

    process.stdin.on('end', () => {
      clearTimeout(timeout);
      if (!input.trim()) {
        resolve(null);
        return;
      }
      try {
        const data = JSON.parse(input.trim());
        resolve(Array.isArray(data) ? data : null);
      } catch (e) {
        resolve(null);
      }
    });
  });
}

// Fetch tasks from Todoist API
function fetchTasks(taskIds = null) {
  const fs = require('fs');
  const envPath = path.join(SCRIPT_DIR, '.env');

  // Load .env file
  let apiToken = process.env.TODOIST_API_TOKEN;
  if (!apiToken && fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    const match = envContent.match(/TODOIST_API_TOKEN=(.+)/);
    if (match) {
      apiToken = match[1].trim();
    }
  }

  if (!apiToken) {
    throw new Error('TODOIST_API_TOKEN not set');
  }

  try {
    // If specific task IDs provided, fetch only those
    if (taskIds && taskIds.length > 0) {
      // Fetch ALL tasks from project in ONE API call, then filter locally (much faster!)
      const projectsCmd = `curl -s -H "Authorization: Bearer ${apiToken}" "https://api.todoist.com/rest/v2/projects"`;
      const projectsJson = execSync(projectsCmd, { encoding: 'utf8' });
      const projects = JSON.parse(projectsJson);
      const project = projects.find(p => p.name.toLowerCase() === config.project.toLowerCase());

      if (!project) {
        throw new Error(`Project "${config.project}" not found`);
      }

      // Get ALL tasks from project
      const tasksCmd = `curl -s -H "Authorization: Bearer ${apiToken}" "https://api.todoist.com/rest/v2/tasks?project_id=${project.id}"`;
      const tasksJson = execSync(tasksCmd, { encoding: 'utf8' });
      const allTasks = JSON.parse(tasksJson);

      // Filter to only the task IDs we want
      const taskIdSet = new Set(taskIds);
      const fetchedTasks = allTasks.filter(task => taskIdSet.has(task.id.toString()));

      return fetchedTasks;
    }

    // Otherwise fetch all tasks from project
    const projectsCmd = `curl -s -H "Authorization: Bearer ${apiToken}" "https://api.todoist.com/rest/v2/projects"`;
    const projectsJson = execSync(projectsCmd, { encoding: 'utf8' });
    const projects = JSON.parse(projectsJson);
    const project = projects.find(p => p.name.toLowerCase() === config.project.toLowerCase());

    if (!project) {
      throw new Error(`Project "${config.project}" not found`);
    }

    // Get tasks
    const tasksCmd = `curl -s -H "Authorization: Bearer ${apiToken}" "https://api.todoist.com/rest/v2/tasks?project_id=${project.id}"`;
    const tasksJson = execSync(tasksCmd, { encoding: 'utf8' });
    tasks = JSON.parse(tasksJson).filter(t => !t.is_completed);

    return tasks;
  } catch (e) {
    throw new Error(`Failed to fetch tasks: ${e.message}`);
  }
}

// Execute shell command
function executeCommand(command) {
  try {
    return execSync(command, { cwd: SCRIPT_DIR, encoding: 'utf8' });
  } catch (e) {
    return `Error: ${e.message}`;
  }
}

// Mark task as complete
function markTaskDone(taskId) {
  const result = executeCommand(`./complete.sh ${taskId}`);
  return result;
}

// Uncomplete a task (reopen it)
function uncompleteTask(taskId) {
  const fs = require('fs');
  const envPath = path.join(SCRIPT_DIR, '.env');

  // Load .env file
  let apiToken = process.env.TODOIST_API_TOKEN;
  if (!apiToken && fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    const match = envContent.match(/TODOIST_API_TOKEN=(.+)/);
    if (match) {
      apiToken = match[1].trim();
    }
  }

  if (!apiToken) {
    return 'Error: TODOIST_API_TOKEN not set';
  }

  try {
    const cmd = `curl -s -X POST -H "Authorization: Bearer ${apiToken}" "https://api.todoist.com/rest/v2/tasks/${taskId}/reopen"`;
    return execSync(cmd, { encoding: 'utf8' });
  } catch (e) {
    return `Error: ${e.message}`;
  }
}

// Update task
function updateTask(taskId, field, value) {
  const result = executeCommand(`./update.sh ${taskId} --${field} "${value}"`);
  return result;
}

// Create the UI
async function createUI() {
  // Load config first
  loadConfig();

  try {
    // Get task IDs from command line arguments (skip first 2: node and script path)
    const taskIds = process.argv.slice(2).filter(arg => arg && arg.trim());

    // Try to read from stdin first (filtered tasks)
    tasks = await readStdin();

    // If no stdin data, check if task IDs provided
    if (!tasks || tasks.length === 0) {
      if (taskIds.length > 0) {
        // Fetch specific tasks by ID
        tasks = await fetchTasks(taskIds);
      } else {
        // Fetch all tasks
        tasks = await fetchTasks();
      }
    }

    // Sort tasks after fetching
    sortTasks();

    // Store all tasks for filtering
    allTasks = [...tasks];
  } catch (e) {
    console.error('Error:', e.message);
    process.exit(1);
  }

  const screen = blessed.screen({
    smartCSR: true,
    title: 'Todoist Tasks TUI'
  });

  // Header
  const header = blessed.box({
    top: 0,
    left: 0,
    width: '100%',
    height: 3,
    content: '{bold}Todoist Tasks{/bold} - {yellow-fg}' + config.project + '{/}' + (config.sortBy !== 'none' ? ' (sorted: ' + config.sortBy + ')' : '') + '\n' +
             '{cyan-fg}↑↓{/cyan-fg} Navigate  {cyan-fg}Enter{/cyan-fg} Toggle  {cyan-fg}Tab{/cyan-fg} Details  {cyan-fg}/{/cyan-fg} Filter  {cyan-fg}a{/cyan-fg} Add  {cyan-fg}e{/cyan-fg} Edit  {cyan-fg}s{/cyan-fg} Sort  {cyan-fg}q{/cyan-fg} Quit',
    tags: true,
    style: {
      fg: 'white',
      border: {
        fg: 'cyan'
      }
    }
  });

  // Filter function
  function applyFilter(filterText) {
    currentFilter = filterText.toLowerCase();
    if (!currentFilter) {
      tasks = [...allTasks];
    } else {
      tasks = allTasks.filter(task => {
        const searchText = currentFilter;

        // Check for priority filter (p:1, p:2, p:3, p:4)
        const priorityMatch = searchText.match(/p:([1-4])/);
        if (priorityMatch) {
          const priorityNum = parseInt(priorityMatch[1]);
          if (task.priority !== priorityNum) return false;
          // Remove priority from search text for further filtering
          const remainingSearch = searchText.replace(/p:[1-4]/g, '').trim();
          if (!remainingSearch) return true; // Only priority filter
        }

        // Check for label filter (@labelname)
        const labelMatches = searchText.match(/@(\w+)/g);
        if (labelMatches) {
          const searchLabels = labelMatches.map(l => l.substring(1).toLowerCase());
          const hasAllLabels = searchLabels.every(searchLabel =>
            task.labels && task.labels.some(taskLabel => taskLabel.toLowerCase().includes(searchLabel))
          );
          if (!hasAllLabels) return false;
          // Remove labels from search text for further filtering
          const remainingSearch = searchText.replace(/@\w+/g, '').trim();
          if (!remainingSearch) return true; // Only label filter
        }

        // Remove special filters for general text search
        const generalSearch = searchText.replace(/p:[1-4]/g, '').replace(/@\w+/g, '').trim();
        if (!generalSearch) return true; // Only had special filters

        // General text search in content, description, and labels
        return task.content.toLowerCase().includes(generalSearch) ||
               (task.description && task.description.toLowerCase().includes(generalSearch)) ||
               (task.labels && task.labels.some(label => label.toLowerCase().includes(generalSearch)));
      });
    }
    sortTasks();
    refreshTaskList();
    if (tasks.length > 0) {
      taskList.select(0);
      updateStatusBar();
    }

    // Update header to show filter status
    const filterStatus = currentFilter ? ` {magenta-fg}[Filter: ${currentFilter}]{/}` : '';
    header.setContent(
      '{bold}Todoist Tasks{/bold} - {yellow-fg}' + config.project + '{/}' + (config.sortBy !== 'none' ? ' (sorted: ' + config.sortBy + ')' : '') + filterStatus + '\n' +
      '{cyan-fg}↑↓{/cyan-fg} Navigate  {cyan-fg}Enter{/cyan-fg} Toggle  {cyan-fg}Tab{/cyan-fg} Details  {cyan-fg}/{/cyan-fg} Filter  {cyan-fg}a{/cyan-fg} Add  {cyan-fg}e{/cyan-fg} Edit  {cyan-fg}s{/cyan-fg} Sort  {cyan-fg}q{/cyan-fg} Quit'
    );
    screen.render();
  }

  // Task list
  const taskList = blessed.list({
    top: 3,
    left: 0,
    width: '100%',
    height: '100%-6',
    keys: true,
    vi: true,
    mouse: true,
    tags: true,
    style: {
      selected: {
        bg: 'blue',
        fg: 'white',
        bold: true
      },
      item: {
        fg: 'white'
      }
    },
    border: {
      type: 'line'
    },
    scrollbar: {
      ch: '█',
      inverse: true
    }
  });

  // Status bar
  const statusBar = blessed.box({
    bottom: 0,
    left: 0,
    width: '100%',
    height: 3,
    content: tasks.length > 0 ? 'Select a task to see details' : 'No tasks loaded',
    tags: true,
    style: {
      fg: 'white',
      bg: 'black'
    }
  });

  screen.append(header);
  screen.append(taskList);
  screen.append(statusBar);

  // Populate task list
  function refreshTaskList() {
    const items = tasks.map((task, index) => {
      const priority = PRIORITY_MAP[task.priority] || PRIORITY_MAP[1];
      const dueDate = task.due ? task.due.string || task.due.date : 'No due date';
      const checkmark = task.is_completed ? '{green-fg}✓{/} ' : '';
      const style = task.is_completed ? '{grey-fg}' : '';
      const endStyle = task.is_completed ? '{/}' : '';
      return `${checkmark}{${priority.color}-fg}${priority.symbol}{/} ${style}${task.content}${endStyle}`;
    });
    taskList.setItems(items);
    screen.render();
  }

  // Update status bar with task details
  function updateStatusBar() {
    if (tasks.length === 0) {
      statusBar.setContent('No tasks loaded');
      screen.render();
      return;
    }

    const task = tasks[taskList.selected];
    if (!task) return;

    const priority = PRIORITY_MAP[task.priority] || PRIORITY_MAP[1];
    const dueDate = task.due ? task.due.string || task.due.date : 'No due date';
    const desc = task.description ? `\n${task.description}` : '';

    statusBar.setContent(
      `{bold}ID:{/bold} ${task.id}  ` +
      `{bold}Priority:{/bold} {${priority.color}-fg}${priority.name}{/}  ` +
      `{bold}Due:{/bold} ${dueDate}${desc}`
    );
    screen.render();
  }

  refreshTaskList();
  if (tasks.length > 0) {
    taskList.select(0);
    updateStatusBar();
  }

  // Focus the task list so keyboard input works immediately
  taskList.focus();

  // Keyboard handlers
  taskList.on('select', updateStatusBar);

  // Update status bar on navigation
  taskList.key(['up', 'k'], function() {
    setTimeout(updateStatusBar, 0);
  });

  taskList.key(['down', 'j'], function() {
    setTimeout(updateStatusBar, 0);
  });

  // Toggle task completion (Enter)
  taskList.key(['enter', 'space'], function() {
    const task = tasks[taskList.selected];
    if (!task) return;

    // Toggle completion state optimistically (update UI first)
    if (task.is_completed) {
      // Uncomplete it
      task.is_completed = false;
      statusBar.setContent('{yellow-fg}◯ Task reopened{/}');

      // Make API call in background
      setTimeout(() => uncompleteTask(task.id), 0);
    } else {
      // Complete it
      task.is_completed = true;
      statusBar.setContent('{green-fg}✓ Task completed{/}');

      // Make API call in background
      setTimeout(() => markTaskDone(task.id), 0);
    }

    // Update UI immediately
    refreshTaskList();
    screen.render();

    // Restore status bar after 1 second
    setTimeout(() => updateStatusBar(), 1000);
  });

  // Edit task (e)
  taskList.key(['e'], function() {
    const task = tasks[taskList.selected];
    if (!task) return;

    const form = blessed.form({
      parent: screen,
      keys: true,
      left: 'center',
      top: 'center',
      width: '80%',
      height: 10,
      border: 'line',
      style: {
        border: {
          fg: 'cyan'
        }
      }
    });

    // Build initial value with current task data
    let initialValue = task.content;
    if (task.priority > 1) {
      initialValue += ` p:${task.priority}`;
    }
    if (task.labels && task.labels.length > 0) {
      initialValue += ' ' + task.labels.map(l => '@' + l).join(' ');
    }

    blessed.text({
      parent: form,
      top: 0,
      left: 1,
      content: '{bold}{cyan-fg}Edit Task{/cyan-fg}{/bold} {dim}(p:1-4 for priority, @label for tags){/}',
      tags: true
    });

    const input = blessed.textbox({
      parent: form,
      top: 2,
      left: 1,
      width: '100%-2',
      height: 3,
      border: 'line',
      inputOnFocus: true,
      value: initialValue
    });

    blessed.text({
      parent: form,
      bottom: 2,
      left: 1,
      content: '{dim}Enter to save • Esc to cancel{/}',
      tags: true
    });

    function saveTask() {
      const inputText = input.getValue().trim();
      if (!inputText) {
        statusBar.setContent('{red-fg}Error: Task content cannot be empty{/}');
        screen.render();
        setTimeout(() => updateStatusBar(), 2000);
        return;
      }

      // Parse input for commands
      let content = inputText;
      let priority = task.priority; // Keep existing priority
      let labels = task.labels ? [...task.labels] : []; // Keep existing labels

      // Extract priority (p:1, p:2, p:3, p:4)
      const priorityMatch = content.match(/p:([1-4])/);
      if (priorityMatch) {
        priority = parseInt(priorityMatch[1]);
        content = content.replace(/p:[1-4]/g, '').trim();
      }

      // Extract labels (@label1 @label2)
      const labelMatches = content.match(/@(\w+)/g);
      if (labelMatches) {
        labels = labelMatches.map(l => l.substring(1));
        content = content.replace(/@\w+/g, '').trim();
      }

      if (!content) {
        statusBar.setContent('{red-fg}Error: Task content cannot be empty{/}');
        screen.render();
        setTimeout(() => updateStatusBar(), 2000);
        return;
      }

      // Close form immediately
      form.destroy();
      taskList.focus();

      // Update task optimistically
      const oldContent = task.content;
      const oldPriority = task.priority;
      const oldLabels = task.labels;

      task.content = content;
      task.priority = priority;
      task.labels = labels;

      // Also update in allTasks to keep filter working
      const allTasksIndex = allTasks.findIndex(t => t.id === task.id);
      if (allTasksIndex !== -1) {
        allTasks[allTasksIndex].content = content;
        allTasks[allTasksIndex].priority = priority;
        allTasks[allTasksIndex].labels = labels;
      }

      refreshTaskList();
      updateStatusBar();
      statusBar.setContent('{green-fg}✓ Task updated!{/}');
      screen.render();

      // Update via API in background
      setTimeout(() => {
        const fs = require('fs');
        const envPath = path.join(SCRIPT_DIR, '.env');
        let apiToken = process.env.TODOIST_API_TOKEN;
        if (!apiToken && fs.existsSync(envPath)) {
          const envContent = fs.readFileSync(envPath, 'utf8');
          const match = envContent.match(/TODOIST_API_TOKEN=(.+)/);
          if (match) {
            apiToken = match[1].trim();
          }
        }

        if (!apiToken) return;

        // Build update payload
        const updates = {};
        if (content !== oldContent) {
          updates.content = content;
        }
        if (priority !== oldPriority) {
          updates.priority = priority;
        }
        if (JSON.stringify(labels) !== JSON.stringify(oldLabels)) {
          updates.labels = labels;
        }

        if (Object.keys(updates).length > 0) {
          const payload = JSON.stringify(updates);
          // Escape single quotes for shell
          const escapedPayload = payload.replace(/'/g, "'\\''");
          executeCommand(`curl -s -X POST -H "Authorization: Bearer ${apiToken}" -H "Content-Type: application/json" -d '${escapedPayload}' "https://api.todoist.com/rest/v2/tasks/${task.id}"`);
        }
      }, 100);
    }

    input.key(['enter'], saveTask);

    form.key(['escape'], function() {
      form.destroy();
      taskList.focus();
      screen.render();
    });

    screen.render();
    input.focus();
  });

  // Change priority (p)
  taskList.key(['p'], function() {
    const task = tasks[taskList.selected];
    if (!task) return;

    const form = blessed.form({
      parent: screen,
      keys: true,
      left: 'center',
      top: 'center',
      width: 40,
      height: 12,
      border: 'line',
      style: {
        border: {
          fg: 'magenta'
        }
      }
    });

    blessed.text({
      parent: form,
      top: 0,
      left: 1,
      content: 'Change Priority:'
    });

    const list = blessed.list({
      parent: form,
      top: 2,
      left: 1,
      width: '100%-2',
      height: 7,
      keys: true,
      vi: true,
      style: {
        selected: {
          bg: 'blue'
        }
      },
      items: [
        '1 - Normal',
        '2 - High',
        '3 - Very High',
        '4 - Urgent'
      ]
    });

    list.select(task.priority - 1);

    list.key(['enter'], function() {
      const newPriority = list.selected + 1;
      updateTask(task.id, 'priority', newPriority);
      task.priority = newPriority;
      form.destroy();
      refreshTaskList();
      updateStatusBar();
      taskList.focus();
    });

    form.key(['escape'], function() {
      form.destroy();
      taskList.focus();
      screen.render();
    });

    screen.render();
    list.focus();
  });

  // Set due date (d)
  taskList.key(['d'], function() {
    const task = tasks[taskList.selected];
    if (!task) return;

    const form = blessed.form({
      parent: screen,
      keys: true,
      left: 'center',
      top: 'center',
      width: 60,
      height: 10,
      border: 'line',
      style: {
        border: {
          fg: 'yellow'
        }
      }
    });

    blessed.text({
      parent: form,
      top: 0,
      left: 1,
      content: 'Set Due Date (e.g., "today", "tomorrow", "next week", "2025-01-15"):'
    });

    const input = blessed.textbox({
      parent: form,
      top: 2,
      left: 1,
      width: '100%-2',
      height: 3,
      border: 'line',
      inputOnFocus: true,
      value: task.due ? task.due.string || task.due.date : ''
    });

    input.key(['enter'], function() {
      const dueDate = input.getValue();
      if (dueDate) {
        updateTask(task.id, 'due', dueDate);
        if (!task.due) task.due = {};
        task.due.string = dueDate;
      }
      form.destroy();
      refreshTaskList();
      updateStatusBar();
      taskList.focus();
    });

    form.key(['escape'], function() {
      form.destroy();
      taskList.focus();
      screen.render();
    });

    screen.render();
    input.focus();
  });

  // Show task details (Tab)
  taskList.key(['tab'], function() {
    const task = tasks[taskList.selected];
    if (!task) return;

    const priority = PRIORITY_MAP[task.priority] || PRIORITY_MAP[1];
    const dueDate = task.due ? task.due.string || task.due.date : 'No due date';
    const labels = task.labels && task.labels.length > 0 ? task.labels.join(', ') : 'None';
    const created = task.created_at ? new Date(task.created_at).toLocaleString() : 'Unknown';

    const detailsBox = blessed.box({
      parent: screen,
      top: 'center',
      left: 'center',
      width: '80%',
      height: '80%',
      border: 'line',
      keys: true,
      vi: true,
      scrollable: true,
      alwaysScroll: true,
      scrollbar: {
        ch: '█',
        inverse: true
      },
      style: {
        border: {
          fg: 'cyan'
        }
      },
      content: `{bold}{cyan-fg}${task.content}{/cyan-fg}{/bold}\n\n` +
               (task.description ? `${task.description}\n\n` : '') +
               `{bold}Priority:{/bold} {${priority.color}-fg}${priority.name}{/}\n` +
               `{bold}Due Date:{/bold} ${dueDate}\n` +
               `{bold}Labels:{/bold} ${labels}\n` +
               `{bold}Status:{/bold} ${task.is_completed ? '{green-fg}Completed{/}' : '{yellow-fg}Active{/}'}\n` +
               `{bold}Created:{/bold} ${created}\n` +
               `{bold}ID:{/bold} ${task.id}\n` +
               `{bold}URL:{/bold} ${task.url}\n\n` +
               `{dim}Press Esc or Tab to close{/}`,
      tags: true
    });

    detailsBox.key(['escape', 'tab', 'q'], function() {
      detailsBox.destroy();
      taskList.focus();
      screen.render();
    });

    screen.render();
    detailsBox.focus();
  });

  // Add new task (a or n)
  taskList.key(['a', 'n'], function() {
    const form = blessed.form({
      parent: screen,
      keys: true,
      left: 'center',
      top: 'center',
      width: '80%',
      height: 10,
      border: 'line',
      style: {
        border: {
          fg: 'green'
        }
      }
    });

    blessed.text({
      parent: form,
      top: 0,
      left: 1,
      content: '{bold}{green-fg}Add Task{/green-fg}{/bold} {dim}(p:1-4 for priority, @label for tags){/}',
      tags: true
    });

    const contentInput = blessed.textbox({
      parent: form,
      top: 2,
      left: 1,
      width: '100%-2',
      height: 3,
      border: 'line',
      inputOnFocus: true
    });

    blessed.text({
      parent: form,
      bottom: 2,
      left: 1,
      content: '{dim}Enter to add • Esc to cancel{/}',
      tags: true
    });

    function createTask() {
      const input = contentInput.getValue().trim();
      if (!input) {
        statusBar.setContent('{red-fg}Error: Task content cannot be empty{/}');
        screen.render();
        setTimeout(() => updateStatusBar(), 2000);
        return;
      }

      // Parse input for commands
      let content = input;
      let priority = '1';
      let labels = [];

      // Extract priority (p:1, p:2, p:3, p:4)
      const priorityMatch = content.match(/p:([1-4])/);
      if (priorityMatch) {
        priority = priorityMatch[1];
        content = content.replace(/p:[1-4]/g, '').trim();
      }

      // Extract labels (@label1 @label2)
      const labelMatches = content.match(/@(\w+)/g);
      if (labelMatches) {
        labels = labelMatches.map(l => l.substring(1));
        content = content.replace(/@\w+/g, '').trim();
      }

      if (!content) {
        statusBar.setContent('{red-fg}Error: Task content cannot be empty{/}');
        screen.render();
        setTimeout(() => updateStatusBar(), 2000);
        return;
      }

      // Build command
      let cmd = `./add.sh "${content}" --priority ${priority}`;
      if (labels.length > 0) {
        cmd += ` --labels "${labels.join(',')}"`;
      }

      // Close form immediately
      form.destroy();
      taskList.focus();

      // Add task optimistically to the list
      const newTask = {
        id: 'temp-' + Date.now(),
        content: content,
        priority: parseInt(priority),
        labels: labels,
        is_completed: false,
        description: '',
        due: null,
        created_at: new Date().toISOString(),
        url: '',
        project_id: config.project
      };

      tasks.unshift(newTask); // Add to top of list
      allTasks.unshift(newTask); // Also add to allTasks for filtering
      sortTasks();
      refreshTaskList();
      taskList.select(0);
      updateStatusBar();

      statusBar.setContent('{green-fg}✓ Task added!{/}');
      screen.render();

      // Create task in background via API
      setTimeout(() => {
        const result = executeCommand(cmd);
        // Optionally: fetch the real task ID and update the temp task
      }, 100);
    }

    contentInput.key(['enter'], createTask);

    form.key(['escape'], function() {
      form.destroy();
      taskList.focus();
      screen.render();
    });

    screen.render();
    contentInput.focus();
  });

  // Filter (/)
  taskList.key(['/'], function() {
    let filterActive = true; // Track if filter is still active

    const filterBox = blessed.box({
      parent: screen,
      bottom: 3,
      left: 0,
      width: '100%',
      height: 3,
      border: 'line',
      style: {
        border: {
          fg: 'magenta'
        }
      }
    });

    const filterLabel = blessed.text({
      parent: filterBox,
      top: 0,
      left: 1,
      content: '{magenta-fg}Filter:{/} ',
      tags: true
    });

    const filterInput = blessed.textbox({
      parent: filterBox,
      top: 0,
      left: 9,
      width: '100%-10',
      height: 1,
      inputOnFocus: true,
      value: currentFilter,
      style: {
        fg: 'white',
        bg: 'black'
      }
    });

    // Live filtering as user types
    filterInput.on('keypress', function(ch, key) {
      // Skip special keys like escape and enter
      if (key && (key.name === 'escape' || key.name === 'enter' || key.name === 'return')) {
        return;
      }

      // Small delay to get the updated value
      setTimeout(() => {
        if (!filterActive) return; // Don't apply if filter was closed
        const filterText = filterInput.getValue();
        applyFilter(filterText);
      }, 10);
    });

    filterInput.key(['enter'], function() {
      filterActive = false;
      filterBox.destroy();
      taskList.focus();
      screen.render();
    });

    filterInput.key(['escape'], function() {
      filterActive = false;
      applyFilter(''); // Clear filter first
      filterBox.destroy();
      taskList.focus();
      screen.render();
    });

    screen.render();
    filterInput.focus();
  });

  // Sort (s)
  taskList.key(['s'], function() {
    const sortBox = blessed.box({
      parent: screen,
      top: 'center',
      left: 'center',
      width: 50,
      height: 12,
      border: 'line',
      keys: true,
      vi: true,
      style: {
        border: {
          fg: 'cyan'
        }
      },
      content: `{bold}{cyan-fg}Sort Tasks{/cyan-fg}{/bold}\n\n` +
               `{cyan-fg}n{/cyan-fg} - None (default order)\n` +
               `{cyan-fg}p{/cyan-fg} - Priority (high to low)\n` +
               `{cyan-fg}d{/cyan-fg} - Due Date (soonest first)\n` +
               `{cyan-fg}c{/cyan-fg} - Created Date (newest first)\n\n` +
               `{dim}Current: ${config.sortBy}{/}\n\n` +
               `{dim}Press Esc to cancel{/}`,
      tags: true
    });

    sortBox.key(['n'], function() {
      config.sortBy = 'none';
      saveConfig();
      sortBox.destroy();
      taskList.focus();
      header.setContent('{bold}Todoist Tasks{/bold} - {yellow-fg}' + config.project + '{/}\n' +
                        '{cyan-fg}↑↓{/cyan-fg} Navigate  {cyan-fg}Enter{/cyan-fg} Toggle  {cyan-fg}Tab{/cyan-fg} Details  {cyan-fg}s{/cyan-fg} Sort  {cyan-fg}a{/cyan-fg} Add  {cyan-fg}e{/cyan-fg} Edit  {cyan-fg},{/cyan-fg} Settings  {cyan-fg}q{/cyan-fg} Quit');
      statusBar.setContent('{green-fg}Sort cleared{/}');
      screen.render();
      setTimeout(() => updateStatusBar(), 1500);
    });

    sortBox.key(['p'], function() {
      config.sortBy = 'priority';
      saveConfig();
      sortTasks();
      refreshTaskList();
      sortBox.destroy();
      taskList.focus();
      header.setContent('{bold}Todoist Tasks{/bold} - {yellow-fg}' + config.project + '{/} (sorted: priority)\n' +
                        '{cyan-fg}↑↓{/cyan-fg} Navigate  {cyan-fg}Enter{/cyan-fg} Toggle  {cyan-fg}Tab{/cyan-fg} Details  {cyan-fg}s{/cyan-fg} Sort  {cyan-fg}a{/cyan-fg} Add  {cyan-fg}e{/cyan-fg} Edit  {cyan-fg},{/cyan-fg} Settings  {cyan-fg}q{/cyan-fg} Quit');
      statusBar.setContent('{green-fg}Sorted by priority{/}');
      screen.render();
      setTimeout(() => updateStatusBar(), 1500);
    });

    sortBox.key(['d'], function() {
      config.sortBy = 'due_date';
      saveConfig();
      sortTasks();
      refreshTaskList();
      sortBox.destroy();
      taskList.focus();
      header.setContent('{bold}Todoist Tasks{/bold} - {yellow-fg}' + config.project + '{/} (sorted: due_date)\n' +
                        '{cyan-fg}↑↓{/cyan-fg} Navigate  {cyan-fg}Enter{/cyan-fg} Toggle  {cyan-fg}Tab{/cyan-fg} Details  {cyan-fg}s{/cyan-fg} Sort  {cyan-fg}a{/cyan-fg} Add  {cyan-fg}e{/cyan-fg} Edit  {cyan-fg},{/cyan-fg} Settings  {cyan-fg}q{/cyan-fg} Quit');
      statusBar.setContent('{green-fg}Sorted by due date{/}');
      screen.render();
      setTimeout(() => updateStatusBar(), 1500);
    });

    sortBox.key(['c'], function() {
      config.sortBy = 'created';
      saveConfig();
      sortTasks();
      refreshTaskList();
      sortBox.destroy();
      taskList.focus();
      header.setContent('{bold}Todoist Tasks{/bold} - {yellow-fg}' + config.project + '{/} (sorted: created)\n' +
                        '{cyan-fg}↑↓{/cyan-fg} Navigate  {cyan-fg}Enter{/cyan-fg} Toggle  {cyan-fg}Tab{/cyan-fg} Details  {cyan-fg}s{/cyan-fg} Sort  {cyan-fg}a{/cyan-fg} Add  {cyan-fg}e{/cyan-fg} Edit  {cyan-fg},{/cyan-fg} Settings  {cyan-fg}q{/cyan-fg} Quit');
      statusBar.setContent('{green-fg}Sorted by created date{/}');
      screen.render();
      setTimeout(() => updateStatusBar(), 1500);
    });

    sortBox.key(['escape'], function() {
      sortBox.destroy();
      taskList.focus();
      screen.render();
    });

    screen.render();
    sortBox.focus();
  });

  // Settings (,)
  taskList.key([','], function() {
    const form = blessed.form({
      parent: screen,
      keys: true,
      left: 'center',
      top: 'center',
      width: '80%',
      height: 12,
      border: 'line',
      style: {
        border: {
          fg: 'magenta'
        }
      }
    });

    blessed.text({
      parent: form,
      top: 0,
      left: 1,
      content: '{bold}{magenta-fg}Settings{/magenta-fg}{/bold}',
      tags: true
    });

    blessed.text({
      parent: form,
      top: 2,
      left: 1,
      content: 'Project name:'
    });

    const input = blessed.textbox({
      parent: form,
      top: 3,
      left: 1,
      width: '100%-2',
      height: 3,
      border: 'line',
      inputOnFocus: true,
      value: config.project
    });

    input.key(['enter'], function() {
      const newProject = input.getValue().trim();
      if (newProject) {
        config.project = newProject;
        saveConfig();
        form.destroy();
        taskList.focus();
        header.setContent('{bold}Todoist Tasks{/bold} - {yellow-fg}' + config.project + '{/}' + (config.sortBy !== 'none' ? ' (sorted: ' + config.sortBy + ')' : '') + '\n' +
                          '{cyan-fg}↑↓{/cyan-fg} Navigate  {cyan-fg}Enter{/cyan-fg} Toggle  {cyan-fg}Tab{/cyan-fg} Details  {cyan-fg}s{/cyan-fg} Sort  {cyan-fg}a{/cyan-fg} Add  {cyan-fg}e{/cyan-fg} Edit  {cyan-fg},{/cyan-fg} Settings  {cyan-fg}q{/cyan-fg} Quit');
        statusBar.setContent('{green-fg}✓ Settings saved! Restart to load new project.{/}');
        screen.render();
        setTimeout(() => updateStatusBar(), 2000);
      }
    });

    form.key(['escape'], function() {
      form.destroy();
      taskList.focus();
      screen.render();
    });

    screen.render();
    input.focus();
  });

  // Quit (q)
  screen.key(['q', 'C-c'], function() {
    return process.exit(0);
  });

  // Quit on Escape only when on main task list (not in a modal)
  screen.key(['escape'], function() {
    // Only quit if the task list has focus (no modal open)
    if (screen.focused === taskList) {
      return process.exit(0);
    }
  });

  screen.render();
}

// Start the app
createUI().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
