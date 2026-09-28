const promptInput = document.getElementById("promptInput");
const generateButton = document.getElementById("generateButton");
const resultPanel = document.getElementById("resultPanel");
const resultTitle = document.getElementById("resultTitle");
const copyButton = document.getElementById("copyButton");
const openButton = document.getElementById("openButton");
const toast = document.getElementById("toast");
const pairingRow = document.getElementById("pairingRow");
const pairingCode = document.getElementById("pairingCode");
const resultHeading = document.getElementById("resultHeading");
const resultDescription = document.getElementById("resultDescription");
const attachButton = document.getElementById("attachButton");
const imageInput = document.getElementById("imageInput");
const attachments = document.getElementById("attachments");
const connectButton = document.getElementById("connectButton");
const connectionText = document.getElementById("connectionText");
const connectionDot = document.getElementById("connectionDot");
const connectionCode = document.getElementById("connectionCode");
const apiBase = window.CANVAS_API_BASE || "https://canvas-ai-worker.mk99anik.workers.dev";
let selectedImages = [];

const showToast = (message) => {
  toast.textContent = message;
  toast.classList.add("show");
  window.setTimeout(() => toast.classList.remove("show"), 2600);
};

const setConnected = () => {
  connectionText.textContent = "Figma подключена";
  connectionDot.classList.add("connected");
  connectionCode.classList.add("hidden");
  connectButton.textContent = "Подключено";
};

const connectFigma = async () => {
  if (window.localStorage.getItem("canvas-device-token")) {
    setConnected();
    return;
  }
  connectButton.disabled = true;
  connectButton.textContent = "Создаём код…";
  try {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 10000);
    const response = await fetch(`${apiBase}/api/pair`, { method: "POST", cache: "no-store", signal: controller.signal });
    window.clearTimeout(timeout);
    const session = await response.json();
    if (!response.ok) throw new Error(session.error || "Не удалось создать подключение");
    connectionText.textContent = "Введите код в плагине Figma";
    connectionCode.textContent = session.pairingCode;
    connectionCode.classList.remove("hidden");
    connectButton.textContent = "Ожидаем плагин…";
    for (let attempt = 0; attempt < 120; attempt += 1) {
      await new Promise((resolve) => window.setTimeout(resolve, 2000));
      const statusResponse = await fetch(`${apiBase}/api/pair/${session.id}`);
      const status = await statusResponse.json();
      if (status.status === "paired" && status.deviceToken) {
        window.localStorage.setItem("canvas-device-token", status.deviceToken);
        setConnected();
        showToast("Figma подключена");
        return;
      }
    }
    throw new Error("Время ожидания подключения истекло");
  } catch (error) {
    connectionText.textContent = error.message;
    connectButton.disabled = false;
    connectButton.textContent = "Подключить Figma";
  }
};

connectButton.addEventListener("click", connectFigma);
if (window.localStorage.getItem("canvas-device-token")) setConnected();

const titleFromPrompt = (prompt) => {
  const words = prompt.replace(/[«»"]/g, "").trim().split(/\s+/).slice(0, 5).join(" ");
  return words.length > 28 ? `${words.slice(0, 28)}…` : words || "Новый дизайн";
};

const finishGeneration = (prompt, job = null) => {
  generateButton.disabled = false;
  generateButton.innerHTML = "<span>Создать в Figma</span><span class=\"button-arrow\">↗</span>";
  resultTitle.textContent = titleFromPrompt(prompt);
  pairingRow.style.display = job?.pairingCode ? "flex" : "none";
  if (job?.pairingCode) pairingCode.textContent = job.pairingCode;
  resultPanel.classList.remove("hidden");
  resultPanel.scrollIntoView({ behavior: "smooth", block: "center" });
};

const readImage = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve({ name: file.name, type: file.type, data: reader.result });
  reader.onerror = reject;
  reader.readAsDataURL(file);
});

const renderAttachments = () => {
  attachments.innerHTML = selectedImages.map((image, index) => `<span class="attachment"><span>▧</span>${image.name}<button type="button" data-index="${index}" aria-label="Удалить ${image.name}">×</button></span>`).join("");
  attachments.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", () => {
      selectedImages.splice(Number(button.dataset.index), 1);
      renderAttachments();
    });
  });
};

const createJob = async (prompt) => {
  const response = await fetch(`${apiBase}/api/jobs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, images: selectedImages, deviceToken: window.localStorage.getItem("canvas-device-token") || "" })
  });
  if (!response.ok) throw new Error("Worker request failed");
  return response.json();
};

attachButton.addEventListener("click", () => imageInput.click());
imageInput.addEventListener("change", async () => {
  const files = Array.from(imageInput.files || []).filter((file) => file.size <= 5 * 1024 * 1024).slice(0, 3 - selectedImages.length);
  selectedImages = selectedImages.concat(await Promise.all(files.map(readImage)));
  renderAttachments();
  imageInput.value = "";
});

const watchJob = async (jobId) => {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    await new Promise((resolve) => window.setTimeout(resolve, 2500));
    const response = await fetch(`${apiBase}/api/jobs/${jobId}`);
    if (!response.ok) return;
    const job = await response.json();
    if (job.deviceToken) window.localStorage.setItem("canvas-device-token", job.deviceToken);
    if (job.status === "complete") {
      openButton.href = job.figmaUrl || "https://www.figma.com/";
      pairingRow.style.display = "none";
      resultHeading.textContent = "Ваш макет создан";
      resultDescription.textContent = "Редактируемые слои уже добавлены в Figma";
      showToast("Макет готов в Figma");
      return;
    }
    if (job.status === "error") {
      resultHeading.textContent = "Не удалось создать макет";
      resultDescription.textContent = job.error || "Попробуйте отправить запрос ещё раз";
      return;
    }
  }
};

const generate = async () => {
  const prompt = promptInput.value.trim();
  if (!prompt) {
    promptInput.focus();
    showToast("Сначала опишите, что нужно создать");
    return;
  }

  generateButton.disabled = true;
  generateButton.innerHTML = "<span>Создаём макет…</span><span class=\"button-arrow\">✦</span>";
  resultPanel.classList.add("hidden");
  pairingRow.style.display = "none";
  if (apiBase) {
    try {
      const job = await createJob(prompt);
      finishGeneration(prompt, job);
      showToast("Код готов. Откройте Canvas AI в Figma Plugin");
      watchJob(job.id);
      return;
    } catch {
      showToast("Worker недоступен, включён demo-режим");
    }
  }
  window.setTimeout(() => finishGeneration(prompt), 1200);
};

generateButton.addEventListener("click", generate);
promptInput.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key === "Enter") generate();
});

document.querySelectorAll(".suggestion").forEach((button) => {
  button.addEventListener("click", () => {
    promptInput.value = button.dataset.prompt;
    promptInput.focus();
  });
});

copyButton.addEventListener("click", async () => {
  const link = openButton.href;
  try {
    await navigator.clipboard.writeText(link);
    showToast("Ссылка скопирована");
  } catch {
    showToast("Ссылка готова: figma.com");
  }
});
