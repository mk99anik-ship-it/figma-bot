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
const apiBase = window.CANVAS_API_BASE || "https://canvas-ai-worker.mk99anik.workers.dev";

const showToast = (message) => {
  toast.textContent = message;
  toast.classList.add("show");
  window.setTimeout(() => toast.classList.remove("show"), 2600);
};

const titleFromPrompt = (prompt) => {
  const words = prompt.replace(/[«»"]/g, "").trim().split(/\s+/).slice(0, 5).join(" ");
  return words.length > 28 ? `${words.slice(0, 28)}…` : words || "Новый дизайн";
};

const finishGeneration = (prompt, job = null) => {
  generateButton.disabled = false;
  generateButton.innerHTML = "<span>Создать в Figma</span><span class=\"button-arrow\">↗</span>";
  resultTitle.textContent = titleFromPrompt(prompt);
  pairingRow.style.display = job ? "flex" : "none";
  if (job) pairingCode.textContent = job.pairingCode;
  resultPanel.classList.remove("hidden");
  resultPanel.scrollIntoView({ behavior: "smooth", block: "center" });
};

const createJob = async (prompt) => {
  const response = await fetch(`${apiBase}/api/jobs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt })
  });
  if (!response.ok) throw new Error("Worker request failed");
  return response.json();
};

const watchJob = async (jobId) => {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    await new Promise((resolve) => window.setTimeout(resolve, 2500));
    const response = await fetch(`${apiBase}/api/jobs/${jobId}`);
    if (!response.ok) return;
    const job = await response.json();
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
