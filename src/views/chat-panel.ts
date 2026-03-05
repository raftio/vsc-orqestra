import * as vscode from "vscode";
import * as api from "../api-client";
import * as auth from "../auth";
import type { ChatMessage, Conversation, Workspace } from "../types";

export class ChatViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewId = "or.chatView";

  private _view?: vscode.WebviewView;
  private _messages: ChatMessage[] = [];
  private _conversationId?: string;
  private _workspaceId?: string;
  private _workspaces: Workspace[] = [];
  private _streaming = false;

  constructor(private readonly _extensionUri: vscode.Uri) {}

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ): void {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri],
    };

    webviewView.webview.html = this._getHtml(webviewView.webview);

    webviewView.webview.onDidReceiveMessage(async (msg) => {
      switch (msg.type) {
        case "ready":
          await this._init();
          break;
        case "sendMessage":
          await this._handleSend(msg.text as string);
          break;
        case "newConversation":
          this._newConversation();
          break;
        case "loadConversation":
          await this._loadConversation(msg.id as string);
          break;
        case "selectWorkspace":
          await this._selectWorkspace(msg.id as string);
          break;
      }
    });

    webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible) {
        this._init();
      }
    });
  }

  private async _init(): Promise<void> {
    if (!(await auth.isLoggedIn())) {
      this._post({ type: "authState", loggedIn: false });
      return;
    }

    this._post({ type: "authState", loggedIn: true });

    try {
      const { workspaces } = await api.listWorkspaces();
      this._workspaces = workspaces;

      if (workspaces.length === 0) {
        this._post({ type: "error", text: "No workspaces found." });
        return;
      }

      this._post({
        type: "workspaces",
        items: workspaces.map((w) => ({ id: w.id, name: w.name })),
        selectedId: this._workspaceId,
      });

      if (!this._workspaceId || !workspaces.find((w) => w.id === this._workspaceId)) {
        this._workspaceId = workspaces[0].id;
        this._post({ type: "workspaceSelected", id: this._workspaceId });
      }

      await this._loadConversationsForWorkspace();
    } catch (err) {
      this._post({ type: "error", text: String(err) });
    }
  }

  private async _selectWorkspace(workspaceId: string): Promise<void> {
    this._workspaceId = workspaceId;
    this._conversationId = undefined;
    this._messages = [];
    this._post({ type: "clearMessages" });
    this._post({ type: "workspaceSelected", id: workspaceId });

    try {
      await this._loadConversationsForWorkspace();
    } catch (err) {
      this._post({ type: "error", text: String(err) });
    }
  }

  private async _loadConversationsForWorkspace(): Promise<void> {
    if (!this._workspaceId) return;
    const { conversations } = await api.listConversations(this._workspaceId);
    this._post({ type: "conversations", items: conversations });
  }

  private _newConversation(): void {
    this._messages = [];
    this._conversationId = undefined;
    this._post({ type: "clearMessages" });
  }

  private async _loadConversation(conversationId: string): Promise<void> {
    if (!this._workspaceId) {
      this._post({ type: "error", text: "No workspace selected. Please wait for initialization." });
      return;
    }
    try {
      const data = await api.getConversation(this._workspaceId, conversationId);
      this._conversationId = conversationId;
      this._messages = data.messages
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));
      this._post({ type: "loadMessages", messages: this._messages });
    } catch (err) {
      this._post({ type: "error", text: String(err) });
    }
  }

  private async _handleSend(text: string): Promise<void> {
    if (this._streaming || !text.trim() || !this._workspaceId) return;

    const userMsg: ChatMessage = { role: "user", content: text.trim() };
    this._messages.push(userMsg);
    this._post({ type: "userMessage", text: userMsg.content });

    this._streaming = true;
    this._post({ type: "streamStart" });

    try {
      const res = await api.streamChat(
        this._workspaceId,
        this._messages,
        this._conversationId,
      );

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`API ${res.status}: ${body.slice(0, 200)}`);
      }

      const convId = res.headers.get("x-conversation-id");
      if (convId) this._conversationId = convId;

      if (!res.body) throw new Error("No response body");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let assistantText = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n");

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed === "data: [DONE]") continue;

          // AI SDK v6 UI message stream: SSE "data: {...}"
          if (trimmed.startsWith("data: ")) {
            try {
              const json = JSON.parse(trimmed.slice(6));
              if (json.type === "text-delta" && typeof json.delta === "string") {
                assistantText += json.delta;
                this._post({ type: "token", text: json.delta });
              }
            } catch {
              // ignore parse errors
            }
          }
        }
      }

      if (assistantText) {
        this._messages.push({ role: "assistant", content: assistantText });
      }

      await this._loadConversationsForWorkspace();
    } catch (err) {
      this._post({ type: "error", text: String(err) });
    } finally {
      this._streaming = false;
      this._post({ type: "streamEnd" });
    }
  }

  private _post(msg: Record<string, unknown>): void {
    this._view?.webview.postMessage(msg);
  }

  private _getHtml(webview: vscode.Webview): string {
    const nonce = getNonce();
    return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <style nonce="${nonce}">
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    html {
      height: 100%;
      overflow: hidden;
    }

    body {
      display: flex;
      flex-direction: column;
      height: 100%;
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      background: var(--vscode-panel-background, var(--vscode-editor-background));
      overflow: hidden;
    }

    #toolbar {
      display: flex;
      flex-direction: column;
      gap: 4px;
      padding: 6px 8px;
      border-bottom: 1px solid var(--vscode-panel-border, var(--vscode-editorWidget-border));
      flex-shrink: 0;
    }

    .toolbar-row {
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .toolbar-label {
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      opacity: 0.5;
      flex-shrink: 0;
      min-width: 28px;
    }

    #ws-select, #conv-select {
      flex: 1;
      min-width: 0;
      background: var(--vscode-dropdown-background);
      color: var(--vscode-dropdown-foreground);
      border: 1px solid var(--vscode-dropdown-border);
      padding: 2px 4px;
      font-size: var(--vscode-font-size);
      border-radius: 2px;
    }

    #new-btn {
      flex-shrink: 0;
      background: none;
      border: none;
      cursor: pointer;
      color: var(--vscode-foreground);
      padding: 2px 6px;
      border-radius: 2px;
      font-size: 14px;
      line-height: 1;
    }
    #new-btn:hover { background: var(--vscode-toolbar-hoverBackground); }

    #messages {
      flex: 1;
      overflow-y: auto;
      padding: 8px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .msg {
      display: flex;
      flex-direction: column;
      gap: 2px;
      max-width: 100%;
    }

    .msg-role {
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      opacity: 0.6;
    }

    .msg-body {
      padding: 6px 10px;
      border-radius: 6px;
      line-height: 1.5;
      word-break: break-word;
    }

    .msg.user .msg-body {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      align-self: flex-end;
      white-space: pre-wrap;
    }

    .msg.assistant .msg-body {
      background: var(--vscode-editor-inactiveSelectionBackground, var(--vscode-list-hoverBackground));
      align-self: flex-start;
    }

    .msg.assistant .msg-body h1, .msg.assistant .msg-body h2, .msg.assistant .msg-body h3,
    .msg.assistant .msg-body h4, .msg.assistant .msg-body h5, .msg.assistant .msg-body h6 {
      margin: 8px 0 4px; font-weight: 600; line-height: 1.3;
    }
    .msg.assistant .msg-body h1 { font-size: 1.3em; }
    .msg.assistant .msg-body h2 { font-size: 1.15em; }
    .msg.assistant .msg-body h3 { font-size: 1.05em; }
    .msg.assistant .msg-body p { margin: 4px 0; }
    .msg.assistant .msg-body pre {
      background: var(--vscode-textCodeBlock-background, rgba(0,0,0,0.15));
      border-radius: 4px; padding: 8px 10px; overflow-x: auto;
      margin: 6px 0; white-space: pre;
    }
    .msg.assistant .msg-body code {
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: 0.88em;
    }
    .msg.assistant .msg-body :not(pre) > code {
      background: var(--vscode-textCodeBlock-background, rgba(0,0,0,0.15));
      padding: 1px 4px; border-radius: 3px;
    }
    .msg.assistant .msg-body ul, .msg.assistant .msg-body ol {
      margin: 4px 0; padding-left: 20px;
    }
    .msg.assistant .msg-body li { margin: 2px 0; }
    .msg.assistant .msg-body blockquote {
      border-left: 3px solid var(--vscode-textBlockQuote-border, rgba(255,255,255,0.2));
      padding: 2px 10px; margin: 4px 0; opacity: 0.85;
    }
    .msg.assistant .msg-body hr {
      border: none;
      border-top: 1px solid var(--vscode-panel-border, rgba(255,255,255,0.15));
      margin: 8px 0;
    }
    .msg.assistant .msg-body a { color: var(--vscode-textLink-foreground); }
    .msg.assistant .msg-body a:hover { text-decoration: underline; }
    .msg.assistant .msg-body strong { font-weight: 600; }
    .msg.assistant .msg-body table { border-collapse: collapse; margin: 6px 0; width: 100%; }
    .msg.assistant .msg-body th, .msg.assistant .msg-body td {
      border: 1px solid var(--vscode-panel-border, rgba(255,255,255,0.15));
      padding: 4px 8px; text-align: left;
    }
    .msg.assistant .msg-body th { background: rgba(255,255,255,0.05); font-weight: 600; }

    .msg.assistant.streaming .msg-body::after {
      content: "▋";
      animation: blink 0.7s step-end infinite;
    }
    @keyframes blink { 50% { opacity: 0; } }

    .notice {
      margin: auto;
      text-align: center;
      opacity: 0.6;
      padding: 16px;
      line-height: 1.6;
    }

    #input-area {
      display: flex;
      gap: 4px;
      padding: 6px 8px;
      border-top: 1px solid var(--vscode-panel-border, var(--vscode-editorWidget-border));
      flex-shrink: 0;
    }

    #input {
      flex: 1;
      resize: none;
      min-height: 54px;
      max-height: 140px;
      padding: 6px 8px;
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border, transparent);
      border-radius: 4px;
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      line-height: 1.4;
    }
    #input:focus { outline: 1px solid var(--vscode-focusBorder); }
    #input::placeholder { color: var(--vscode-input-placeholderForeground); }

    #send-btn {
      align-self: flex-end;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      border-radius: 4px;
      padding: 6px 12px;
      cursor: pointer;
      font-size: var(--vscode-font-size);
    }
    #send-btn:hover:not(:disabled) { background: var(--vscode-button-hoverBackground); }
    #send-btn:disabled { opacity: 0.5; cursor: not-allowed; }
  </style>
</head>
<body>
  <div id="toolbar">
    <div class="toolbar-row">
      <span class="toolbar-label">WS</span>
      <select id="ws-select" title="Workspace"></select>
    </div>
    <div class="toolbar-row">
      <select id="conv-select" title="Conversations">
        <option value="">New conversation</option>
      </select>
      <button id="new-btn" title="New conversation">＋</button>
    </div>
  </div>

  <div id="messages">
    <div id="auth-notice" class="notice" style="display:none">
      Please sign in to OR to use chat.
    </div>
    <div id="empty-notice" class="notice">Start a conversation with the OR AI agent.</div>
  </div>

  <div id="input-area">
    <textarea id="input" placeholder="Ask anything… (Enter to send, Shift+Enter for newline)" rows="2"></textarea>
    <button id="send-btn">Send</button>
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();

    const messagesEl = document.getElementById('messages');
    const inputEl = document.getElementById('input');
    const sendBtn = document.getElementById('send-btn');
    const wsSelect = document.getElementById('ws-select');
    const convSelect = document.getElementById('conv-select');
    const newBtn = document.getElementById('new-btn');
    const authNotice = document.getElementById('auth-notice');
    const emptyNotice = document.getElementById('empty-notice');

    let streamingEl = null;
    let streamingRawText = '';

    const TICK = String.fromCharCode(96);
    const FENCE = TICK + TICK + TICK;
    const TICK_RE = new RegExp(TICK + '([^' + TICK + ']+)' + TICK, 'g');

    var NL = String.fromCharCode(10);
    var RE_BOLD = new RegExp('\\\\*\\\\*(.+?)\\\\*\\\\*', 'g');
    var RE_BOLD2 = new RegExp('__(.+?)__', 'g');
    var RE_ITALIC = new RegExp('\\\\*(.+?)\\\\*', 'g');
    var RE_LINK = new RegExp('\\\\[([^\\\\]]+)\\\\]\\\\(([^)]+)\\\\)', 'g');
    var RE_HEADING = new RegExp('^(#{1,6})\\\\s+(.+)$');
    var RE_HR = new RegExp('^\\\\s*([-*_])\\\\1{2,}\\\\s*$');
    var RE_TABLE_SEP = new RegExp('^\\\\|[\\\\s\\\\-:|]+\\\\|$');
    var RE_UL = new RegExp('^\\\\s*[-*+]\\\\s+(.+)$');
    var RE_OL = new RegExp('^\\\\s*\\\\d+\\\\.\\\\s+(.+)$');

    function escHtml(s) {
      return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function renderInline(s) {
      s = escHtml(s);
      s = s.replace(TICK_RE, '<code>$1</code>');
      s = s.replace(RE_BOLD, '<strong>$1</strong>');
      s = s.replace(RE_BOLD2, '<strong>$1</strong>');
      s = s.replace(RE_ITALIC, '<em>$1</em>');
      s = s.replace(RE_LINK, '<a href="$2" title="$2">$1</a>');
      return s;
    }

    function renderMarkdown(raw) {
      var lines = raw.split(NL);
      var html = '';
      var inCode = false, codeText = '';
      var inList = false, listTag = '';
      var inTable = false, tblRow = 0;

      for (var i = 0; i < lines.length; i++) {
        var line = lines[i];

        if (line.trimStart().startsWith(FENCE)) {
          if (!inCode) {
            if (inList) { html += '</' + listTag + '>'; inList = false; }
            if (inTable) { html += '</table>'; inTable = false; }
            inCode = true; codeText = '';
          } else {
            html += '<pre><code>' + escHtml(codeText) + '</code></pre>';
            inCode = false;
          }
          continue;
        }
        if (inCode) { codeText += (codeText ? NL : '') + line; continue; }

        var hm = line.match(RE_HEADING);
        if (hm) {
          if (inList) { html += '</' + listTag + '>'; inList = false; }
          if (inTable) { html += '</table>'; inTable = false; }
          html += '<h' + hm[1].length + '>' + renderInline(hm[2]) + '</h' + hm[1].length + '>';
          continue;
        }
        if (RE_HR.test(line)) {
          RE_HR.lastIndex = 0;
          if (inList) { html += '</' + listTag + '>'; inList = false; }
          if (inTable) { html += '</table>'; inTable = false; }
          html += '<hr>';
          continue;
        }
        if (line.startsWith('> ')) {
          if (inList) { html += '</' + listTag + '>'; inList = false; }
          if (inTable) { html += '</table>'; inTable = false; }
          html += '<blockquote>' + renderInline(line.slice(2)) + '</blockquote>';
          continue;
        }

        if (line.trim().startsWith('|') && line.trim().endsWith('|')) {
          if (inList) { html += '</' + listTag + '>'; inList = false; }
          if (!inTable) { inTable = true; tblRow = 0; html += '<table>'; }
          tblRow++;
          if (RE_TABLE_SEP.test(line.trim())) { RE_TABLE_SEP.lastIndex = 0; continue; }
          RE_TABLE_SEP.lastIndex = 0;
          var cells = line.trim().slice(1, -1).split('|').map(function(c) { return c.trim(); });
          var tag = tblRow === 1 ? 'th' : 'td';
          html += '<tr>' + cells.map(function(c) { return '<' + tag + '>' + renderInline(c) + '</' + tag + '>'; }).join('') + '</tr>';
          continue;
        }
        if (inTable) { html += '</table>'; inTable = false; }

        var ulm = line.match(RE_UL);
        if (ulm) {
          if (!inList || listTag !== 'ul') { if (inList) html += '</' + listTag + '>'; html += '<ul>'; inList = true; listTag = 'ul'; }
          html += '<li>' + renderInline(ulm[1]) + '</li>';
          continue;
        }
        var olm = line.match(RE_OL);
        if (olm) {
          if (!inList || listTag !== 'ol') { if (inList) html += '</' + listTag + '>'; html += '<ol>'; inList = true; listTag = 'ol'; }
          html += '<li>' + renderInline(olm[1]) + '</li>';
          continue;
        }
        if (inList) { html += '</' + listTag + '>'; inList = false; }

        if (!line.trim()) continue;
        html += '<p>' + renderInline(line) + '</p>';
      }

      if (inCode) html += '<pre><code>' + escHtml(codeText) + '</code></pre>';
      if (inList) html += '</' + listTag + '>';
      if (inTable) html += '</table>';
      return html;
    }

    function scrollToBottom() {
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    function setUiEnabled(enabled) {
      inputEl.disabled = !enabled;
      sendBtn.disabled = !enabled;
    }

    function clearMsgElements() {
      Array.from(messagesEl.children).forEach((el) => {
        if (el !== authNotice && el !== emptyNotice) el.remove();
      });
    }

    function appendMessage(role, text) {
      emptyNotice.style.display = 'none';
      const wrap = document.createElement('div');
      wrap.className = 'msg ' + role;
      const roleEl = document.createElement('div');
      roleEl.className = 'msg-role';
      roleEl.textContent = role === 'user' ? 'You' : 'Assistant';
      const body = document.createElement('div');
      body.className = 'msg-body';
      if (role === 'assistant' && text) {
        body.innerHTML = renderMarkdown(text);
      } else {
        body.textContent = text;
      }
      wrap.appendChild(roleEl);
      wrap.appendChild(body);
      messagesEl.appendChild(wrap);
      scrollToBottom();
      return wrap;
    }

    function send() {
      const text = inputEl.value.trim();
      if (!text) return;
      inputEl.value = '';
      inputEl.style.height = '';
      vscode.postMessage({ type: 'sendMessage', text });
    }

    sendBtn.addEventListener('click', send);

    inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        send();
      }
    });

    inputEl.addEventListener('input', () => {
      inputEl.style.height = 'auto';
      inputEl.style.height = Math.min(inputEl.scrollHeight, 140) + 'px';
    });

    wsSelect.addEventListener('change', () => {
      vscode.postMessage({ type: 'selectWorkspace', id: wsSelect.value });
    });

    convSelect.addEventListener('change', () => {
      const id = convSelect.value;
      if (id) {
        vscode.postMessage({ type: 'loadConversation', id });
      } else {
        vscode.postMessage({ type: 'newConversation' });
      }
    });

    newBtn.addEventListener('click', () => {
      convSelect.value = '';
      vscode.postMessage({ type: 'newConversation' });
    });

    window.addEventListener('message', (event) => {
      const msg = event.data;
      switch (msg.type) {
        case 'authState':
          if (!msg.loggedIn) {
            authNotice.style.display = 'block';
            emptyNotice.style.display = 'none';
            setUiEnabled(false);
          } else {
            authNotice.style.display = 'none';
            setUiEnabled(true);
          }
          break;

        case 'workspaces': {
          wsSelect.innerHTML = '';
          for (const w of msg.items) {
            const opt = document.createElement('option');
            opt.value = w.id;
            opt.textContent = w.name || w.id;
            wsSelect.appendChild(opt);
          }
          if (msg.selectedId) wsSelect.value = msg.selectedId;
          break;
        }

        case 'workspaceSelected':
          wsSelect.value = msg.id;
          break;

        case 'conversations': {
          const current = convSelect.value;
          while (convSelect.options.length > 1) convSelect.remove(1);
          for (const c of msg.items) {
            const opt = document.createElement('option');
            opt.value = c.id;
            opt.textContent = c.title || 'Untitled';
            convSelect.appendChild(opt);
          }
          if (current) convSelect.value = current;
          break;
        }

        case 'clearMessages':
          clearMsgElements();
          emptyNotice.style.display = '';
          break;

        case 'loadMessages': {
          clearMsgElements();
          emptyNotice.style.display = 'none';
          for (const m of msg.messages) appendMessage(m.role, m.content);
          break;
        }

        case 'userMessage':
          appendMessage('user', msg.text);
          break;

        case 'streamStart':
          setUiEnabled(false);
          streamingRawText = '';
          streamingEl = appendMessage('assistant', '');
          streamingEl.classList.add('streaming');
          break;

        case 'token':
          if (streamingEl) {
            streamingRawText += msg.text;
            streamingEl.querySelector('.msg-body').innerHTML = renderMarkdown(streamingRawText);
            scrollToBottom();
          }
          break;

        case 'streamEnd':
          if (streamingEl) {
            streamingEl.querySelector('.msg-body').innerHTML = renderMarkdown(streamingRawText);
            streamingEl.classList.remove('streaming');
            streamingEl = null;
          }
          streamingRawText = '';
          setUiEnabled(true);
          inputEl.focus();
          break;

        case 'error':
          if (streamingEl) {
            streamingEl.classList.remove('streaming');
            streamingEl = null;
          }
          setUiEnabled(true);
          {
            const errWrap = document.createElement('div');
            errWrap.style.cssText = 'color:var(--vscode-errorForeground);padding:4px 8px;font-size:11px;';
            errWrap.textContent = 'Error: ' + msg.text;
            messagesEl.appendChild(errWrap);
            scrollToBottom();
          }
          break;
      }
    });

    vscode.postMessage({ type: 'ready' });
  </script>
</body>
</html>`;
  }
}

function getNonce(): string {
  let text = "";
  const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
