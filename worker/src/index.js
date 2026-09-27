const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, X-Plugin-Token",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
};

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });

const now = () => Date.now();

const randomValue = (size) => crypto.randomUUID().replaceAll("-", "").slice(0, size).toUpperCase();

const fallbackDesign = (prompt) => ({
  name: prompt.split(/\s+/).slice(0, 5).join(" ") || "Canvas AI design",
  width: 1440,
  height: 1024,
  background: "#F7F7FB",
  nodes: [
    { type: "frame", name: "Main screen", x: 80, y: 80, width: 1280, height: 864, fill: "#FFFFFF", radius: 24 },
    { type: "text", name: "Headline", text: "Your next big idea", x: 160, y: 190, width: 620, fontSize: 64, fontWeight: 700, color: "#1C1C27" },
    { type: "text", name: "Description", text: "A flexible starting point for your design.", x: 164, y: 290, width: 460, fontSize: 20, fontWeight: 400, color: "#777783" },
    { type: "rectangle", name: "Primary button", text: "Get started", x: 160, y: 370, width: 180, height: 56, fill: "#6857E7", radius: 12 },
    { type: "rectangle", name: "Visual card", x: 760, y: 170, width: 450, height: 550, fill: "#ECEAFF", radius: 28 }
  ]
});

const normalizeDesign = (value, prompt) => {
  if (!value || !Array.isArray(value.nodes)) return fallbackDesign(prompt);
  return {
    name: String(value.name || "Canvas AI design").slice(0, 100),
    width: Number(value.width) || 1440,
    height: Number(value.height) || 1024,
    background: String(value.background || "#F7F7FB"),
    nodes: value.nodes.slice(0, 80).map((node) => ({
      type: ["frame", "rectangle", "text"].includes(node.type) ? node.type : "rectangle",
      name: String(node.name || "Generated layer").slice(0, 100),
      text: node.text ? String(node.text).slice(0, 1000) : undefined,
      x: Number(node.x) || 0,
      y: Number(node.y) || 0,
      width: Math.min(Math.max(Number(node.width) || 100, 1), 4000),
      height: Math.min(Math.max(Number(node.height) || 100, 1), 4000),
      fontSize: Math.min(Math.max(Number(node.fontSize) || 16, 8), 160),
      fontWeight: Number(node.fontWeight) || 400,
      fill: String(node.fill || "#FFFFFF"),
      color: String(node.color || "#1C1C27"),
      radius: Math.min(Math.max(Number(node.radius) || 0, 0), 100)
    }))
  };
};

const designInstructions = "Return only valid JSON. Create a Figma design spec with name, width, height, background, and nodes. Each node must use type frame, rectangle, or text and include x,y,width,height. Text nodes include text,fontSize,fontWeight,color. Rectangle and frame nodes include fill,radius. Keep it to 20 nodes.";

const generateDesign = async (prompt, env) => {
  if (env.AI_ROUTER_API_KEY) {
    const endpoint = `${env.AI_ROUTER_URL || "https://routerai.ru/api/v1"}/chat/completions`;
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.AI_ROUTER_API_KEY}`
      },
      body: JSON.stringify({
        model: env.AI_ROUTER_MODEL || "gpt-6-luna-pro",
        messages: [
          { role: "system", content: designInstructions },
          { role: "user", content: prompt }
        ],
        temperature: 0.2,
        response_format: { type: "json_object" }
      })
    });
    if (!response.ok) throw new Error(`AI Router returned ${response.status}`);
    const result = await response.json();
    const content = result.choices?.[0]?.message?.content || "{}";
    return normalizeDesign(JSON.parse(content), prompt);
  }
  if (env.AI) {
    const result = await env.AI.run("@cf/meta/llama-3.1-8b-instruct", {
      messages: [
        { role: "system", content: designInstructions },
        { role: "user", content: prompt }
      ],
      response_format: { type: "json_object" }
    });
    return normalizeDesign(JSON.parse(result.response || "{}"), prompt);
  }
  return fallbackDesign(prompt);
};

const memory = new Map();

const saveJob = async (env, job) => {
  if (env.DB) {
    await env.DB.prepare("INSERT INTO jobs (id, pairing_code, prompt, status, design_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .bind(job.id, job.pairingCode, job.prompt, job.status, JSON.stringify(job.design), job.createdAt, job.createdAt).run();
  } else {
    memory.set(job.id, job);
  }
};

const getJob = async (env, id) => {
  if (env.DB) {
    const row = await env.DB.prepare("SELECT * FROM jobs WHERE id = ?").bind(id).first();
    if (!row) return null;
    return { ...row, pairingCode: row.pairing_code, design: row.design_json ? JSON.parse(row.design_json) : null };
  }
  return memory.get(id) || null;
};

const updateJob = async (env, job) => {
  job.updatedAt = now();
  if (env.DB) {
    await env.DB.prepare("UPDATE jobs SET status = ?, design_json = ?, figma_url = ?, error = ?, updated_at = ? WHERE id = ?")
      .bind(job.status, JSON.stringify(job.design), job.figmaUrl || null, job.error || null, job.updatedAt, job.id).run();
  } else {
    memory.set(job.id, job);
  }
};

const route = async (request, env) => {
  const url = new URL(request.url);
  if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (url.pathname === "/api/health") return json({ ok: true, service: "canvas-ai-worker" });

  if (request.method === "POST" && url.pathname === "/api/jobs") {
    const body = await request.json().catch(() => ({}));
    const prompt = String(body.prompt || "").trim();
    if (!prompt || prompt.length > 4000) return json({ error: "Prompt must contain between 1 and 4000 characters" }, 400);
    const job = {
      id: crypto.randomUUID(),
      pairingCode: randomValue(6),
      prompt,
      status: "generating",
      createdAt: now()
    };
    try {
      job.design = await generateDesign(prompt, env);
      job.status = "waiting_for_plugin";
      await saveJob(env, job);
      return json({ id: job.id, pairingCode: job.pairingCode, status: job.status });
    } catch (error) {
      job.status = "error";
      job.error = "AI generation failed";
      await saveJob(env, job);
      return json({ id: job.id, status: job.status, error: job.error }, 502);
    }
  }

  const jobMatch = url.pathname.match(/^\/api\/jobs\/([^/]+)$/);
  if (request.method === "GET" && jobMatch) {
    const job = await getJob(env, jobMatch[1]);
    if (!job) return json({ error: "Job not found" }, 404);
    return json({ id: job.id, status: job.status, pairingCode: job.pairingCode, figmaUrl: job.figmaUrl || null, error: job.error || null });
  }

  if (request.method === "POST" && url.pathname === "/api/plugin/claim") {
    const body = await request.json().catch(() => ({}));
    const job = [...(env.DB ? await env.DB.prepare("SELECT * FROM jobs WHERE pairing_code = ? AND status = 'waiting_for_plugin'").bind(String(body.pairingCode || "").toUpperCase()).all().then((result) => result.results) : memory.values())][0];
    if (!job) return json({ error: "Pairing code not found or already used" }, 404);
    const normalized = env.DB ? { ...job, design: JSON.parse(job.design_json) } : job;
    normalized.status = "processing";
    await updateJob(env, normalized);
    return json({ id: normalized.id, prompt: normalized.prompt, design: normalized.design });
  }

  if (request.method === "POST" && url.pathname.match(/^\/api\/jobs\/[^/]+\/complete$/)) {
    const id = url.pathname.split("/")[3];
    const job = await getJob(env, id);
    if (!job) return json({ error: "Job not found" }, 404);
    const body = await request.json().catch(() => ({}));
    job.status = body.error ? "error" : "complete";
    job.error = body.error || null;
    job.figmaUrl = body.figmaUrl || null;
    await updateJob(env, job);
    return json({ ok: true });
  }

  return json({ error: "Not found" }, 404);
};

export default {
  async fetch(request, env) {
    try {
      return await route(request, env);
    } catch {
      return json({ error: "Unexpected server error" }, 500);
    }
  }
};
