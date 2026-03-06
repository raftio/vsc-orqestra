# OR — VSCode Extension

Fetch execution bundles and execute tasks with AI assistance directly from your IDE.

## Features

- **Sign In / Sign Out** — authenticate with your OR account via email and password
- **Execution Bundle sidebar** — browse all workspaces and their bundles in the Activity Bar
- **Fetch Bundle** — pull a bundle by ticket ID into the sidebar tree
- **Execute Task** — send a task prompt straight into Cursor/VS Code Chat
- **Execute Bundle** — send all tasks in a bundle as a single prompt
- **Submit Evidence** — report local test results back to OR
- **Chat panel** — built-in webview chat integrated in the OR sidebar
- **Status Bar** — shows active bundle count at a glance

## Setup

1. Install the extension (VSIX or marketplace)
2. Open the command palette (`Cmd+Shift+P`) and run **OR: Sign In**
   - Enter your OR API URL (default: `http://localhost:3001`)
   - Enter your email and password
3. Browse bundles in the **OR** sidebar, or run **OR: Fetch Bundle** to load one by ticket ID

### Configuration

| Setting | Default | Description |
|---|---|---|
| `or.apiUrl` | `http://localhost:3001` | Base URL of the OR API |

## Commands

| Command | Description |
|---|---|
| `OR: Sign In` | Authenticate with email + password |
| `OR: Sign Out` | Clear stored session |
| `OR: Fetch Bundle` | Load a bundle by ticket ID |
| `OR: Execute Bundle` | Send entire bundle to AI chat |
| `OR: Execute Task` | Send a single task to AI chat |
| `OR: Submit Evidence` | Submit test results for the active bundle |

## Development

```bash
npm install
npm run build    # one-time build
npm run watch    # rebuild on change
npm run package  # minified production build
```

Press `F5` in VSCode to launch the Extension Development Host.
