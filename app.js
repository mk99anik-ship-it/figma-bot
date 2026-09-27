const promptInput = document.getElementById("promptInput");
const generateButton = document.getElementById("generateButton");
const resultPanel = document.getElementById("resultPanel");
const resultTitle = document.getElementById("resultTitle");
const copyButton = document.getElementById("copyButton");
const openButton = document.getElementById("openButton");
const toast = document.getElementById("toast");

const showToast = (message) => {
  toast.textContent = message;
  toast.classList.add("show");
  window.setTimeout(() => toast.classList.remove("show"), 2600);
};

const titleFromPrompt = (prompt) => {
  const words = prompt.replace(/[«»"]/g, "").trim().split(/\s+/).slice(0, 5).join(" ");
  return words.length > 28 ? `${words.slice(0, 28)}…` : words || "Новый дизайн";
};

const finishGeneration = (prompt) => {
  generateButton.disabled = false;
  generateButton.innerHTML = "<span>Создать в Figma</span><span class=\"button-arrow\">↗</span>";
  resultTitle.textContent = titleFromPrompt(prompt);
  resultPanel.classList.remove("hidden");
  resultPanel.scrollIntoView({ behavior: "smooth", block: "center" });
};

const generate = () => {
  const prompt = promptInput.value.trim();
  if (!prompt) {
    promptInput.focus();
    showToast("Сначала опишите, что нужно создать");
    return;
  }

  generateButton.disabled = true;
  generateButton.innerHTML = "<span>Создаём макет…</span><span class=\"button-arrow\">✦</span>";
  resultPanel.classList.add("hidden");
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
