figma.showUI(__html__, { width: 360, height: 460 });

const hexToRgb = (hex) => {
  const value = hex.replace("#", "");
  const full = value.length === 3 ? value.split("").map((char) => char + char).join("") : value;
  return {
    r: parseInt(full.slice(0, 2), 16) / 255,
    g: parseInt(full.slice(2, 4), 16) / 255,
    b: parseInt(full.slice(4, 6), 16) / 255
  };
};

const paint = (hex) => ({ type: "SOLID", color: hexToRgb(hex) });

const loadFont = async (weight) => {
  await figma.loadFontAsync({ family: "Inter", style: weight >= 600 ? "Bold" : "Regular" });
};

const colorFromPrompt = (prompt) => {
  const colors = [
    ["син", "#2563EB"],
    ["голуб", "#38BDF8"],
    ["красн", "#EF4444"],
    ["зелён", "#22C55E"],
    ["зелен", "#22C55E"],
    ["жёлт", "#EAB308"],
    ["желт", "#EAB308"],
    ["оранж", "#F97316"],
    ["фиолет", "#8B5CF6"],
    ["чёрн", "#111827"],
    ["черн", "#111827"],
    ["бел", "#FFFFFF"],
    ["blue", "#2563EB"],
    ["red", "#EF4444"],
    ["green", "#22C55E"],
    ["yellow", "#EAB308"],
    ["orange", "#F97316"],
    ["purple", "#8B5CF6"],
    ["black", "#111827"],
    ["white", "#FFFFFF"]
  ];
  const match = colors.find(([name]) => prompt.toLowerCase().includes(name));
  return match ? match[1] : null;
};

const editSelection = async (prompt) => {
  const selection = [...figma.currentPage.selection];
  if (!selection.length) return false;
  const text = prompt.toLowerCase();
  const color = colorFromPrompt(text);
  if (color && /(перекрас|цвет|залив|color|recolor|paint)/.test(text)) {
    selection.forEach((node) => {
      if ("fills" in node) node.fills = [paint(color)];
    });
    return true;
  }
  if (/(удал|delete|remove)/.test(text)) {
    selection.forEach((node) => node.remove());
    return true;
  }
  if (/(скругл|закругл|round|radius)/.test(text)) {
    selection.forEach((node) => {
      if ("cornerRadius" in node) node.cornerRadius = 16;
    });
    return true;
  }
  if (/(увелич|больше|larger|increase)/.test(text) || /(уменьш|меньше|smaller|decrease)/.test(text)) {
    const factor = /(уменьш|меньше|smaller|decrease)/.test(text) ? 0.9 : 1.1;
    selection.forEach((node) => node.resize(node.width * factor, node.height * factor));
    return true;
  }
  return false;
};

const createDesign = async (design, prompt) => {
  if (editSelection(prompt)) {
    figma.ui.postMessage({ type: "edited" });
    return;
  }
  const page = figma.currentPage;
  const root = figma.createFrame();
  root.name = design.name || "Canvas AI design";
  root.resize(design.width || 1440, design.height || 1024);
  root.fills = [paint(design.background || "#F7F7FB")];
  root.cornerRadius = 24;
  page.appendChild(root);

  for (const node of design.nodes || []) {
    if (node.type === "text") {
      await loadFont(node.fontWeight);
      const text = figma.createText();
      text.name = node.name;
      text.characters = node.text || "Text";
      text.fontSize = node.fontSize || 16;
      text.fontName = { family: "Inter", style: node.fontWeight >= 600 ? "Bold" : "Regular" };
      text.fills = [paint(node.color || "#1C1C27")];
      text.resizeWithoutConstraints(node.width || 300, node.height || 60);
      text.x = node.x || 0;
      text.y = node.y || 0;
      root.appendChild(text);
    } else {
      const shape = node.type === "frame" ? figma.createFrame() : figma.createRectangle();
      shape.name = node.name;
      shape.resize(node.width || 100, node.height || 100);
      shape.x = node.x || 0;
      shape.y = node.y || 0;
      shape.fills = [paint(node.fill || "#FFFFFF")];
      shape.cornerRadius = node.radius || 0;
      root.appendChild(shape);
    }
  }

  figma.currentPage.selection = [root];
  figma.viewport.scrollAndZoomIntoView([root]);
  return `https://www.figma.com/design/${figma.fileKey || ""}?node-id=${root.id.replace(":", "-")}`;
};

figma.ui.onmessage = async (message) => {
  if (message.type !== "create-design") return;
  try {
    const figmaUrl = await createDesign(message.design, message.prompt || "");
    figma.ui.postMessage({ type: "created", figmaUrl });
  } catch (error) {
    figma.ui.postMessage({ type: "failed", error: error.message || "Could not create design" });
  }
};
