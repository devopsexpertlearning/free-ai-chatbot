const chatContainer = document.getElementById('chatContainer');
const userInput = document.getElementById('userInput');
const sendBtn = document.getElementById('sendBtn');
const themeToggle = document.getElementById('themeToggle');
const scrollBtn = document.getElementById('scrollBtn');
const modelSelect = document.getElementById('modelSelect');

// --- Helpers ---
function linkify(text) {
  // Convert links
  let html = text.replace(/(https?:\/\/[^\s]+)/g, url =>
    `<a href="${url}" target="_blank" style="color:#0b93f6;">${url}</a>`
  );
  // Convert **bold** and __bold__ to <b>
  html = html.replace(/(\*\*|__)(.*?)\1/g, '<b>$2</b>');
  return html;
}
function markdownify(text) {
  // Escape HTML
  let html = text.replace(/[&<>]/g, t => ({
    '&':'&amp;','<':'&lt;','>':'&gt;'
  }[t]));

  // Horizontal rules
  html = html.replace(/^\s*(---|\*\*\*)\s*$/gm, '<hr>');

  // Headings
  html = html.replace(/^### (.*)$/gm, '<h3>$1</h3>')
             .replace(/^## (.*)$/gm, '<h2>$1</h2>')
             .replace(/^# (.*)$/gm, '<h1>$1</h1>');

  // Bold
  html = html.replace(/(\*\*|__)(.*?)\1/g, '<b>$2</b>');
  // Italic
  html = html.replace(/(\*|_)(.*?)\1/g, '<i>$2</i>');
  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  // Links
  html = html.replace(/(https?:\/\/[^\s]+)/g, url =>
    `<a href="${url}" target="_blank" style="color:#0b93f6;">${url}</a>`
  );

  // Unordered lists: group consecutive - or * lines
  html = html.replace(/((?:^\s*[-*] .+\n?)+)/gm, match => {
    const items = match.trim().split('\n').map(line =>
      `<li>${line.replace(/^\s*[-*] /, '')}</li>`
    ).join('');
    return `<ul>${items}</ul>`;
  });

  // Ordered lists: group consecutive lines starting with number-dot-space
  html = html.replace(/((?:^\s*\d+\.\s.+\n?)+)/gm, match => {
    const items = match.trim().split('\n').map(line =>
      `<li>${line.replace(/^\s*\d+\.\s/, '')}</li>`
    ).join('');
    return `<ol>${items}</ol>`;
  });

  // Remove multiple <hr> in a row
  html = html.replace(/(<hr>\s*){2,}/g, '<hr>');

  // Remove extra blank lines
  html = html.replace(/\n{2,}/g, '\n');

  // Remove blank lines before/after code blocks
  html = html.replace(/(\n\s*)+<pre>/g, '<pre>');
  html = html.replace(/<\/pre>(\s*\n)+/g, '</pre>');

  // Remove blank lines directly before code blocks (<pre>)
  html = html.replace(/(\n\s*)+(<pre>)/g, '$2');

  // Split into lines and wrap only plain text lines in <p>
  html = html.split('\n').map(line => {
    if (
      line.trim().startsWith('<h') ||
      line.trim().startsWith('<ul>') ||
      line.trim().startsWith('<ol>') ||
      line.trim().startsWith('<li>') ||
      line.trim().startsWith('<hr>') ||
      line.trim().startsWith('<pre>') ||
      line.trim().startsWith('</ul>') ||
      line.trim().startsWith('</ol>') ||
      line.trim() === ''
    ) {
      return line;
    }
    return `<p>${line.trim()}</p>`;
  }).join('');

  // Remove empty <p></p>
  html = html.replace(/<p><\/p>/g, '');

  // Remove <p> or blank lines directly before <pre>
  html = html.replace(/(<p>\s*<\/p>\s*)+(?=<pre>)/g, '');

  // Remove any whitespace or <br> before <pre>
  html = html.replace(/((<br\s*\/?>|\s)+)(<pre>)/g, '$3');

  return html;
}
function detectLanguage(code) {
  if (/^\s*<\w+/.test(code)) return 'html';
  if (/^\s*def\s+/.test(code) || /print\(/.test(code)) return 'python';
  if (/^\s*(const|let|var|function)/.test(code)) return 'javascript';
  return 'javascript';
}
function isUserNearBottom() {
  // 40px threshold for "near bottom"
  return chatContainer.scrollTop + chatContainer.clientHeight >= chatContainer.scrollHeight - 40;
}
function scrollToBottom() {
  chatContainer.scrollTop = chatContainer.scrollHeight;
}
function setSendLoading(isLoading) {
  const sendBtn = document.getElementById('sendBtn');
  if (isLoading) {
    sendBtn.disabled = true;
    sendBtn.innerHTML = `<span class="spinner"></span>`;
  } else {
    sendBtn.disabled = false;
    sendBtn.innerHTML = 'Send';
  }
}

// --- Message Rendering ---
function appendUserMessage(text) {
  const msg = document.createElement('div');
  msg.className = 'message user';
  msg.innerHTML = linkify(text);
  chatContainer.appendChild(msg);
  if (isUserNearBottom()) scrollToBottom();
}
function createBotMessage() {
  const msg = document.createElement('div');
  msg.className = 'message bot';
  chatContainer.appendChild(msg);
  if (isUserNearBottom()) scrollToBottom();
  return msg;
}
function addTypingIndicator(botMsgDiv) {
  botMsgDiv.innerHTML = '<span class="typing"></span><span class="typing"></span><span class="typing"></span>';
}
function removeTypingIndicator(botMsgDiv) {
  if (botMsgDiv.innerHTML.includes('typing')) botMsgDiv.innerHTML = '';
}
function finalizeCodeCopyButtons(msgDiv) {
  msgDiv.querySelectorAll('pre').forEach(pre => {
    const btn = pre.querySelector('.copy-btn');
    if (btn) {
      btn.addEventListener('click', () => {
        navigator.clipboard.writeText(pre.innerText.replace("Copy", "").trim());
        btn.innerText = 'Copied!';
        setTimeout(() => (btn.innerText = 'Copy'), 1500);
      });
    }
  });
}

// --- Conversation History ---
let conversation = [];

// --- Send Message ---
async function sendMessage() {
  const prompt = userInput.value.trim();
  if (!prompt) return;
  appendUserMessage(prompt);
  userInput.value = '';

  // Add user message to conversation history
  conversation.push({ role: 'user', content: prompt });

  const botMsgDiv = createBotMessage();
  addTypingIndicator(botMsgDiv);
  setSendLoading(true);

  const selectedModel = modelSelect.value;

  try {
    // Build conversation context as a single string
    const history = conversation
      .map(msg => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`)
      .join('\n');
    const fullPrompt = history + `\nAssistant:`;

    // Send as a string, not an array
    const stream = await puter.ai.chat(fullPrompt, {
      model: selectedModel,
      stream: true
    });

    let fullText = '';
    removeTypingIndicator(botMsgDiv);

    for await (const part of stream) {
      if (part?.text) {
        // Track if user was near bottom before update
        const wasNearBottom = isUserNearBottom();

        fullText += part.text;
        botMsgDiv.innerHTML = fullText.split(/```/).map((chunk, i) => {
          if (i % 2 === 0) return markdownify(chunk.trim());
          const lang = detectLanguage(chunk);
          return `
            <pre><code class="language-${lang}">${Prism.highlight(
              chunk.trim(),
              Prism.languages[lang] || Prism.languages.javascript,
              lang
            )}</code><button class="copy-btn">Copy</button></pre>`;
        }).join('');

        // Only scroll if user was already at/near bottom
        if (wasNearBottom) scrollToBottom();
      }
    }
    finalizeCodeCopyButtons(botMsgDiv);

    // Add assistant message to conversation history
    conversation.push({ role: 'assistant', content: fullText });

  } catch (err) {
    removeTypingIndicator(botMsgDiv);
    botMsgDiv.classList.add('error');
    let errorMsg = '';
    if (typeof err === 'string') {
      errorMsg = err;
    } else if (err instanceof Error) {
      errorMsg = err.message;
    } else {
      errorMsg = JSON.stringify(err);
    }
    botMsgDiv.innerText = 'Error: ' + errorMsg;
  } finally {
    setSendLoading(false);
  }
}

// --- Load Models ---
async function loadModels() {
  try {
    const res = await fetch('models.json');
    const models = await res.json();

    modelSelect.innerHTML = '';
    models.forEach(model => {
      const option = document.createElement('option');
      option.value = model;
      option.textContent = model;
      modelSelect.appendChild(option);
    });

    // Remember last selection
    const lastModel = localStorage.getItem('selectedModel');
    if (lastModel && models.includes(lastModel)) {
      modelSelect.value = lastModel;
    }

    modelSelect.addEventListener('change', () => {
      localStorage.setItem('selectedModel', modelSelect.value);
    });

  } catch (err) {
    console.error('Failed to load models:', err);
    modelSelect.innerHTML = `<option>Error loading models</option>`;
  }
}

// --- Event Listeners ---
sendBtn.addEventListener('click', sendMessage);
userInput.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});
userInput.addEventListener('input', () => {
  userInput.style.height = 'auto';
  userInput.style.height = userInput.scrollHeight + 'px';
});
themeToggle.addEventListener('click', () => document.body.classList.toggle('light'));
scrollBtn.addEventListener('click', () => { chatContainer.scrollTop = chatContainer.scrollHeight; scrollBtn.style.display = 'none'; });
chatContainer.addEventListener('scroll', () => {
  scrollBtn.style.display = (chatContainer.scrollTop + chatContainer.clientHeight >= chatContainer.scrollHeight - 20) ? 'none' : 'block';
});

// Init
loadModels();
