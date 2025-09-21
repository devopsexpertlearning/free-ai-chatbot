const chatContainer = document.getElementById('chatContainer');
const userInput = document.getElementById('userInput');
const sendBtn = document.getElementById('sendBtn');
const themeToggle = document.getElementById('themeToggle');
const scrollBtn = document.getElementById('scrollBtn');
const modelSelect = document.getElementById('modelSelect');

// --- Helpers ---
function linkify(text) {
  return text.replace(/(https?:\/\/[^\s]+)/g, url =>
    `<a href="${url}" target="_blank" style="color:#0b93f6;">${url}</a>`
  );
}
function detectLanguage(code) {
  if (/^\s*<\w+/.test(code)) return 'html';
  if (/^\s*def\s+/.test(code) || /print\(/.test(code)) return 'python';
  if (/^\s*(const|let|var|function)/.test(code)) return 'javascript';
  return 'javascript';
}
function scrollToBottomIfNear() {
  if (chatContainer.scrollTop + chatContainer.clientHeight >= chatContainer.scrollHeight - 50) {
    chatContainer.scrollTop = chatContainer.scrollHeight;
  }
}

// --- Message Rendering ---
function appendUserMessage(text) {
  const msg = document.createElement('div');
  msg.className = 'message user';
  msg.innerHTML = linkify(text);
  chatContainer.appendChild(msg);
  scrollToBottomIfNear();
}
function createBotMessage() {
  const msg = document.createElement('div');
  msg.className = 'message bot';
  chatContainer.appendChild(msg);
  scrollToBottomIfNear();
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

// --- Send Message ---
async function sendMessage() {
  const prompt = userInput.value.trim();
  if (!prompt) return;
  appendUserMessage(prompt);
  userInput.value = '';
  const botMsgDiv = createBotMessage();
  addTypingIndicator(botMsgDiv);
  sendBtn.disabled = true;

  const selectedModel = modelSelect.value;

  try {
    const stream = await puter.ai.chat(prompt, { model: selectedModel, stream: true });
    let fullText = '';
    removeTypingIndicator(botMsgDiv);

    for await (const part of stream) {
      if (part?.text) {
        fullText += part.text;
        botMsgDiv.innerHTML = fullText.split(/```/).map((chunk, i) => {
          if (i % 2 === 0) return linkify(chunk.trim());   // trim text chunks
          const lang = detectLanguage(chunk);
          return `
            <pre><code class="language-${lang}">${Prism.highlight(
              chunk.trim(),
              Prism.languages[lang] || Prism.languages.javascript,
              lang
            )}</code><button class="copy-btn">Copy</button></pre>`;
        }).join('');
        scrollToBottomIfNear();
      }
    }
    finalizeCodeCopyButtons(botMsgDiv);
  } catch (err) {
    removeTypingIndicator(botMsgDiv);
    botMsgDiv.classList.add('error');
    botMsgDiv.innerText = 'Error: ' + (err.message || err);
  } finally {
    sendBtn.disabled = false;
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
userInput.addEventListener('keydown', e => { if (e.key === 'Enter') sendMessage(); });
themeToggle.addEventListener('click', () => document.body.classList.toggle('light'));
scrollBtn.addEventListener('click', () => { chatContainer.scrollTop = chatContainer.scrollHeight; scrollBtn.style.display = 'none'; });
chatContainer.addEventListener('scroll', () => {
  scrollBtn.style.display = (chatContainer.scrollTop + chatContainer.clientHeight >= chatContainer.scrollHeight - 20) ? 'none' : 'block';
});

// Init
loadModels();
