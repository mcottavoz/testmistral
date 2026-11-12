(() => {
  "use strict";

  // ---------- State ----------
  const STORAGE_KEY = "mistral-chat-v1";
  const SETTINGS_KEY = "mistral-chat-settings-v1";

  const defaultSettings = {
    model: "mistral-small-latest",
    systemPrompt: "",
    temperature: 0.7,
    maxTokens: 0,
    theme: "dark",
  };

  let state = { conversations: [], activeId: null };
  let settings = { ...defaultSettings };
  let controller = null;
  let generating = false;

  // ---------- DOM ----------
  const $ = (id) => document.getElementById(id);
  const chatEl = $("chat");
  const form = $("form");
  const input = $("input");
  const sendBtn = $("sendBtn");
  const stopBtn = $("stopBtn");
  const convList = $("conversationList");
  const sidebar = $("sidebar");
  const settingsOverlay = $("settingsOverlay");
  const toastEl = $("toast");

  // ---------- Utils ----------
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const esc = (s) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  function save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }

  function load() {
    try {
      state = JSON.parse(localStorage.getItem(STORAGE_KEY)) || state;
      settings = { ...defaultSettings, ...JSON.parse(localStorage.getItem(SETTINGS_KEY)) };
    } catch { /* ignore corrupted storage */ }
  }

  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.hidden = false;
    setTimeout(() => (toastEl.hidden = true), 2200);
  }

  // ---------- Markdown (safe, minimal) ----------
  function renderMarkdown(text) {
    const blocks = [];
    let src = text.replace(/```(\w*)\n?([\s\S]*?)(?:```|$)/g, (_m, lang, code) => {
      blocks.push({ lang: lang || "code", code });
      return `\u0000B${blocks.length - 1}\u0000`;
    });

    let html = esc(src);
    html = html
      .replace(/^###### (.*)$/gm, "<h6>$1</h6>")
      .replace(/^##### (.*)$/gm, "<h5>$1</h5>")
      .replace(/^#### (.*)$/gm, "<h4>$1</h4>")
      .replace(/^### (.*)$/gm, "<h3>$1</h3>")
      .replace(/^## (.*)$/gm, "<h2>$1</h2>")
      .replace(/^# (.*)$/gm, "<h1>$1</h1>")
      .replace(/^&gt; (.*)$/gm, "<blockquote>$1</blockquote>")
      .replace(/^\s*[-*] (.*)$/gm, "<li>$1</li>")
      .replace(/^\s*\d+\. (.*)$/gm, "<li>$1</li>")
      .replace(/<\/li>\s*\n\s*(?=<li>)/g, "</li>")
      .replace(/<li>\s*\n\s*(?=<li>)/g, "<li>")
      .replace(/(<li>[\s\S]*?<\/li>)(?!\s*<li>)/g, "<ul>$1</ul>")
      .replace(/`([^`\n]+)`/g, "<code>$1</code>")
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/\*([^*\n]+)\*/g, "<em>$1</em>")
      .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
      .replace(/\n{2,}/g, "<br><br>")
      .replace(/\n/g, "<br>");

    html = html.replace(/\u0000B(\d+)\u0000/g, (_m, i) => {
      const b = blocks[Number(i)];
      return (
        `<div class="code-block"><div class="code-header"><span>${esc(b.lang)}</span>` +
        `<button class="copy-code" data-code="${esc(b.code)}">Copier</button></div>` +
        `<pre>${esc(b.code.replace(/\n$/, ""))}</pre></div>`
      );
    });

    return html;
  }


  // ---------- Conversations ----------
  function activeConversation() {
    return state.conversations.find((c) => c.id === state.activeId) || null;
  }

  function newConversation() {
    const conv = { id: uid(), title: "Nouvelle conversation", messages: [], createdAt: Date.now() };
    state.conversations.unshift(conv);
    state.activeId = conv.id;
    save();
    renderConversations();
    renderMessages();
    input.focus();
    return conv;
  }

  function deleteConversation(id, ev) {
    ev.stopPropagation();
    state.conversations = state.conversations.filter((c) => c.id !== id);
    if (state.activeId === id) {
      state.activeId = state.conversations[0]?.id ?? null;
    }
    save();
    renderConversations();
    renderMessages();
  }

  function renderConversations() {
    convList.innerHTML = "";
    state.conversations.forEach((c) => {
      const item = document.createElement("div");
      item.className = "conv-item" + (c.id === state.activeId ? " active" : "");
      item.innerHTML = `<span>💬</span><span class="conv-title"></span><button class="conv-delete" title="Supprimer">🗑️</button>`;
      item.querySelector(".conv-title").textContent = c.title;
      item.onclick = () => {
        state.activeId = c.id;
        save();
        renderConversations();
        renderMessages();
        if (window.innerWidth <= 768) sidebar.classList.add("collapsed");
      };
      item.querySelector(".conv-delete").onclick = (ev) => deleteConversation(c.id, ev);
      convList.appendChild(item);
    });
    $("topbarTitle").textContent = activeConversation()?.title ?? "Nouvelle conversation";
  }

  // ---------- Messages ----------
  function showWelcome(show) {
    const existing = $("welcome");
    if (existing) existing.remove();
    if (!show) return;
    chatEl.innerHTML = "";
    const w = document.createElement("div");
    w.className = "welcome";
    w.id = "welcome";
    w.innerHTML = $("welcomeTemplate").innerHTML;
    chatEl.appendChild(w);
    w.querySelectorAll(".suggestion").forEach((b) => {
      b.onclick = () => {
        input.value = b.dataset.prompt;
        form.requestSubmit();
      };
    });
  }

  function renderMessages() {
    const conv = activeConversation();
    chatEl.innerHTML = "";
    if (!conv || conv.messages.length === 0) {
      showWelcome(true);
      return;
    }
    const wrap = document.createElement("div");
    wrap.className = "messages";
    conv.messages.forEach((m) => wrap.appendChild(buildMessageEl(m)));
    chatEl.appendChild(wrap);
    chatEl.scrollTop = chatEl.scrollHeight;
  }

  function buildMessageEl(m) {
    const div = document.createElement("div");
    div.className = "msg " + (m.role === "user" ? "user" : "bot");
    const avatar = document.createElement("div");
    avatar.className = "avatar";
    avatar.textContent = m.role === "user" ? "🧑" : "M";
    const body = document.createElement("div");
    body.className = "msg-body";

    if (m.role === "user") {
      body.textContent = m.content;
    } else if (m.error) {
      body.innerHTML = `<div class="error-msg">${esc(m.content)}</div>`;
    } else {
      body.innerHTML = `<div class="msg-content">${renderMarkdown(m.content)}</div>`;
      const actions = document.createElement("div");
      actions.className = "msg-actions";
      actions.innerHTML =
        `<button class="msg-action" data-action="copy">📋 Copier</button>` +
        `<button class="msg-action" data-action="regen">🔄 Régénérer</button>`;
      actions.querySelector('[data-action="copy"]').onclick = () => {
        navigator.clipboard.writeText(m.content).then(() => toast("Copié !"));
      };
      actions.querySelector('[data-action="regen"]').onclick = () => regenerate();
      body.appendChild(actions);
    }
    div.append(avatar, body);
    return div;
  }

  function appendStreamingMessage() {
    const wrap = chatEl.querySelector(".messages") || (() => {
      const w = document.createElement("div");
      w.className = "messages";
      chatEl.appendChild(w);
      return w;
    })();
    const div = document.createElement("div");
    div.className = "msg bot";
    div.innerHTML = `<div class="avatar">M</div><div class="msg-body"><div class="typing"><span></span><span></span><span></span></div></div>`;
    wrap.appendChild(div);
    chatEl.scrollTop = chatEl.scrollHeight;
    return div.querySelector(".msg-body");
  }

  // ---------- Chat ----------
  function setGenerating(on) {
    generating = on;
    sendBtn.disabled = on;
    stopBtn.classList.toggle("show", on);
  }

  async function sendMessage(text) {
    const conv = activeConversation() || newConversation();
    if (conv.messages.length === 0) {
      conv.title = text.slice(0, 40) + (text.length > 40 ? "…" : "");
      renderConversations();
    }
    conv.messages.push({ role: "user", content: text });
    renderMessages();
    save();

    await streamReply(conv);
  }

  async function regenerate() {
    const conv = activeConversation();
    if (!conv || generating) return;
    while (conv.messages.length && conv.messages[conv.messages.length - 1].role !== "user") {
      conv.messages.pop();
    }
    if (!conv.messages.length) return;
    renderMessages();
    save();
    await streamReply(conv);
  }

  function buildApiMessages(conv) {
    const msgs = [];
    if (settings.systemPrompt.trim()) {
      msgs.push({ role: "system", content: settings.systemPrompt.trim() });
    }
    conv.messages.slice(-30).forEach((m) => {
      if (!m.error) msgs.push({ role: m.role, content: m.content });
    });
    return msgs;
  }

  async function streamReply(conv) {
    setGenerating(true);
    const bodyEl = appendStreamingMessage();
    let acc = "";
    controller = new AbortController();

    const update = (final) => {
      const html = renderMarkdown(acc) + (final ? "" : '<span class="cursor-blink"></span>');
      const content = bodyEl.querySelector(".msg-content");
      if (content) {
        content.innerHTML = html;
      } else {
        bodyEl.innerHTML = `<div class="msg-content">${html}</div>`;
      }
      chatEl.scrollTop = chatEl.scrollHeight;
    };

    try {
      const res = await fetch("/api/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          messages: buildApiMessages(conv),
          model: settings.model,
          temperature: settings.temperature,
          maxTokens: settings.maxTokens > 0 ? settings.maxTokens : undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Erreur ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const events = buffer.split("\n\n");
        buffer = events.pop() || "";
        for (const raw of events) {
          const lines = raw.split("\n");
          const eventType = (lines.find((l) => l.startsWith("event: ")) || "").slice(7).trim();
          const dataLine = (lines.find((l) => l.startsWith("data: ")) || "").slice(6);
          if (!dataLine) continue;
          const data = JSON.parse(dataLine);

          if (eventType === "delta" && data.text) {
            acc += data.text;
            update(false);
          } else if (eventType === "error") {
            throw new Error(data.message || "Erreur de streaming.");
          } else if (eventType === "done") {
            break;
          }
        }
      }

      if (!acc) acc = "(réponse vide)";
      conv.messages.push({ role: "assistant", content: acc });
      save();
      renderMessages();
    } catch (err) {
      if (err.name === "AbortError") {
        if (acc) {
          conv.messages.push({ role: "assistant", content: acc + " ⏹️ (interrompu)" });
          save();
          renderMessages();
        } else {
          renderMessages();
        }
      } else {
        conv.messages.push({ role: "assistant", content: err.message, error: true });
        save();
        renderMessages();
      }
    } finally {
      controller = null;
      setGenerating(false);
    }
  }

  // ---------- Settings ----------
  function applyTheme() {
    document.body.dataset.theme = settings.theme;
    $("themeToggle").checked = settings.theme === "light";
  }

  function fillSettingsForm() {
    $("modelSelect").value = settings.model;
    $("systemPrompt").value = settings.systemPrompt;
    $("temperature").value = settings.temperature;
    $("tempValue").value = settings.temperature;
    $("maxTokens").value = settings.maxTokens;
  }

  function openSettings() {
    fillSettingsForm();
    settingsOverlay.hidden = false;
  }

  async function loadModels() {
    const select = $("modelSelect");
    try {
      const res = await fetch("/api/models");
      const data = await res.json();
      select.innerHTML = data.models.map((m) => `<option value="${m}">${m}</option>`).join("");
    } catch {
      select.innerHTML = `<option value="mistral-small-latest">mistral-small-latest</option>`;
    }
    select.value = settings.model;
  }

  // ---------- Events ----------
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text || generating) return;
    input.value = "";
    autoResize();
    sendMessage(text);
  });

  input.addEventListener("input", autoResize);
  function autoResize() {
    input.style.height = "auto";
    input.style.height = Math.min(input.scrollHeight, 180) + "px";
  }

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      form.requestSubmit();
    }
  });

  stopBtn.addEventListener("click", () => controller?.abort());

  $("newChatBtn").addEventListener("click", () => newConversation());
  $("clearBtn").addEventListener("click", () => {
    const conv = activeConversation();
    if (!conv) return;
    conv.messages = [];
    conv.title = "Nouvelle conversation";
    save();
    renderConversations();
    renderMessages();
  });

  $("openSidebar").addEventListener("click", () => sidebar.classList.toggle("collapsed"));
  $("closeSidebar").addEventListener("click", () => sidebar.classList.add("collapsed"));

  $("themeToggle").addEventListener("change", (e) => {
    settings.theme = e.target.checked ? "light" : "dark";
    applyTheme();
    save();
  });

  $("settingsBtn").addEventListener("click", openSettings);
  $("closeSettings").addEventListener("click", () => (settingsOverlay.hidden = true));
  settingsOverlay.addEventListener("click", (e) => {
    if (e.target === settingsOverlay) settingsOverlay.hidden = true;
  });

  $("temperature").addEventListener("input", (e) => {
    $("tempValue").value = e.target.value;
  });

  $("saveSettings").addEventListener("click", () => {
    settings.model = $("modelSelect").value;
    settings.systemPrompt = $("systemPrompt").value;
    settings.temperature = Number($("temperature").value);
    settings.maxTokens = Math.max(0, Number($("maxTokens").value) || 0);
    save();
    settingsOverlay.hidden = true;
    toast("Réglages enregistrés ✨");
  });

  $("resetSettings").addEventListener("click", () => {
    settings = { ...defaultSettings, theme: settings.theme };
    applyTheme();
    fillSettingsForm();
    save();
  });

  document.addEventListener("click", (e) => {
    if (e.target.classList?.contains("copy-code")) {
      const btn = e.target;
      navigator.clipboard.writeText(btn.dataset.code).then(() => {
        btn.textContent = "✓ Copié";
        setTimeout(() => (btn.textContent = "Copier"), 1500);
      });
    }
  });

  // ---------- Init ----------
  load();
  applyTheme();
  loadModels();
  if (!state.conversations.length) newConversation();
  renderConversations();
  renderMessages();
  if (window.innerWidth <= 768) sidebar.classList.add("collapsed");
})();
