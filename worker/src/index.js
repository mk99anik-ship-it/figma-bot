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

const generateDesign = async (prompt, images, env) => {
  if (env.AI_ROUTER_API_KEY) {
    const endpoint = `${env.AI_ROUTER_URL || "https://routerai.ru/api/v1"}/chat/completions`;
    const userContent = [{ type: "text", text: prompt }];
    for (const image of images.slice(0, 3)) {
      if (image.type?.startsWith("image/") && image.data?.startsWith("data:image/")) {
        userContent.push({ type: "image_url", image_url: { url: image.data } });
      }
    }
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.AI_ROUTER_API_KEY}`
      },
      body: JSON.stringify({
        model: env.AI_ROUTER_MODEL || "openai/gpt-6-luna-pro",
        messages: [
          { role: "system", content: designInstructions },
          { role: "user", content: userContent }
        ],
        temperature: 0.2,
        response_format: { type: "json_object" }
      })
    });
    if (!response.ok) {
      const errorText = (await response.text()).slice(0, 500);
      throw new Error(`AI Router returned ${response.status}: ${errorText}`);
    }
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

const modifyPage = async (prompt, nodes, images, env) => {
  if (!env.AI_ROUTER_API_KEY) return { actions: [] };
  const endpoint = `${env.AI_ROUTER_URL || "https://routerai.ru/api/v1"}/chat/completions`;
  const content = [{
    type: "text",
    text: `User request: ${prompt}\nCurrent Figma page nodes: ${JSON.stringify(nodes).slice(0, 120000)}`
  }];
  for (const image of images.slice(0, 3)) {
    if (image.type?.startsWith("image/") && image.data?.startsWith("data:image/")) content.push({ type: "image_url", image_url: { url: image.data } });
  }
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.AI_ROUTER_API_KEY}` },
    body: JSON.stringify({
      model: env.AI_ROUTER_MODEL || "openai/gpt-6-luna-pro",
      messages: [
        {
          role: "system",
          content: "You are an autonomous Figma design editor. Understand the user's request semantically, in any language, and apply it to the current page. Return only JSON in the form {\"actions\":[...]}. Use node IDs from the current page. Allowed actions: set_fill {nodeId,color}, set_text {nodeId,text}, resize {nodeId,width,height}, move {nodeId,x,y}, set_radius {nodeId,radius}, delete {nodeId}, create_frame {name,x,y,width,height,fill,radius}, create_text {name,text,x,y,width,fontSize,fontWeight,color}. Choose the correct existing nodes by their names, text, type, hierarchy, and geometry. For any actionable request, always return at least one action. If the user asks to create something new, use create actions. Never invent node IDs and never return an empty actions array for a valid edit request."
        },
        { role: "user", content }
      ],
      temperature: 0.1,
      response_format: { type: "json_object" }
    })
  });
  if (!response.ok) throw new Error("AI modification failed");
  const result = await response.json();
  const parsed = JSON.parse(result.choices?.[0]?.message?.content || "{}");
  const allowed = new Set(["set_fill", "set_text", "resize", "move", "set_radius", "delete", "create_frame", "create_text"]);
  const candidateActions = parsed.actions || parsed.commands || parsed.operations || [];
  const actions = Array.isArray(candidateActions) ? candidateActions.filter((action) => allowed.has(action.type)).slice(0, 100) : [];
  return {
    actions
  };
};

const memory = new Map();
const pairMemory = new Map();

const saveJob = async (env, job) => {
  if (env.DB) {
    await env.DB.prepare("INSERT INTO jobs (id, pairing_code, device_token, prompt, status, design_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(job.id, job.pairingCode, job.deviceToken || null, job.prompt, job.status, JSON.stringify(job.design || null), job.createdAt, job.createdAt).run();
  } else {
    memory.set(job.id, job);
  }
};

const getJob = async (env, id) => {
  if (env.DB) {
    const row = await env.DB.prepare("SELECT * FROM jobs WHERE id = ?").bind(id).first();
    if (!row) return null;
    return { ...row, pairingCode: row.pairing_code, deviceToken: row.device_token, design: row.design_json ? JSON.parse(row.design_json) : null };
  }
  return memory.get(id) || null;
};

const updateJob = async (env, job) => {
  job.updatedAt = now();
  if (env.DB) {
    await env.DB.prepare("UPDATE jobs SET status = ?, design_json = ?, figma_url = ?, error = ?, device_token = ?, updated_at = ? WHERE id = ?")
      .bind(job.status, JSON.stringify(job.design || null), job.figmaUrl || null, job.error || null, job.deviceToken || null, job.updatedAt, job.id).run();
  } else {
    memory.set(job.id, job);
  }
};

const createPairSession = async (env) => {
  const session = {
    id: crypto.randomUUID(),
    pairingCode: randomValue(6),
    status: "pending",
    createdAt: now(),
    updatedAt: now()
  };
  if (env.DB) {
    await env.DB.prepare("INSERT INTO pair_sessions (id, pairing_code, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?)")
      .bind(session.id, session.pairingCode, session.status, session.createdAt, session.updatedAt).run();
  } else {
    pairMemory.set(session.id, session);
  }
  return session;
};

const getPairSession = async (env, id) => {
  if (env.DB) {
    const row = await env.DB.prepare("SELECT * FROM pair_sessions WHERE id = ?").bind(id).first();
    if (!row) return null;
    return { ...row, pairingCode: row.pairing_code, deviceToken: row.device_token };
  }
  return pairMemory.get(id) || null;
};

const route = async (request, env) => {
  const url = new URL(request.url);
  if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (url.pathname === "/api/health") return json({ ok: true, service: "canvas-ai-worker" });
  if (request.method === "GET" && url.pathname === "/api/models") {
    if (!env.AI_ROUTER_API_KEY) return json({ error: "AI Router key is not configured" }, 503);
    const response = await fetch(`${env.AI_ROUTER_URL || "https://routerai.ru/api/v1"}/models`, {
      headers: { Authorization: `Bearer ${env.AI_ROUTER_API_KEY}` }
    });
    return new Response(await response.text(), {
      status: response.status,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  if (request.method === "POST" && url.pathname === "/api/pair") {
    const session = await createPairSession(env);
    return json({ id: session.id, pairingCode: session.pairingCode, status: session.status });
  }

  if (request.method === "POST" && url.pathname === "/api/generate") {
    const body = await request.json().catch(() => ({}));
    const prompt = String(body.prompt || "").trim();
    const images = Array.isArray(body.images) ? body.images.filter((image) => image && typeof image.data === "string" && image.data.length <= 7_000_000) : [];
    if (!prompt || prompt.length > 4000) return json({ error: "Prompt must contain between 1 and 4000 characters" }, 400);
    try {
      const design = await generateDesign(prompt, images, env);
      return json({ design });
    } catch {
      return json({ error: "AI generation failed" }, 502);
    }
  }

  if (request.method === "POST" && url.pathname === "/api/modify") {
    const body = await request.json().catch(() => ({}));
    const prompt = String(body.prompt || "").trim();
    const nodes = Array.isArray(body.nodes) ? body.nodes : [];
    const images = Array.isArray(body.images) ? body.images.filter((image) => image && typeof image.data === "string" && image.data.length <= 7_000_000) : [];
    if (!prompt || prompt.length > 4000) return json({ error: "Prompt must contain between 1 and 4000 characters" }, 400);
    try {
      return json(await modifyPage(prompt, nodes, images, env));
    } catch {
      return json({ error: "AI modification failed" }, 502);
    }
  }

  const pairMatch = url.pathname.match(/^\/api\/pair\/([^/]+)$/);
  if (request.method === "GET" && pairMatch) {
    const session = await getPairSession(env, pairMatch[1]);
    if (!session) return json({ error: "Pair session not found" }, 404);
    return json({ id: session.id, status: session.status, deviceToken: session.deviceToken || null });
  }

  if (request.method === "POST" && url.pathname === "/api/pair/claim") {
    const body = await request.json().catch(() => ({}));
    const code = String(body.pairingCode || "").toUpperCase();
    const session = env.DB
      ? await env.DB.prepare("SELECT * FROM pair_sessions WHERE pairing_code = ? AND status = 'pending'").bind(code).first()
      : [...pairMemory.values()].find((item) => item.pairingCode === code && item.status === "pending");
    if (!session) return json({ error: "Pairing code not found" }, 404);
    const deviceToken = randomValue(32);
    if (env.DB) {
      await env.DB.prepare("UPDATE pair_sessions SET device_token = ?, status = 'paired', updated_at = ? WHERE id = ?")
        .bind(deviceToken, now(), session.id).run();
    } else {
      session.deviceToken = deviceToken;
      session.status = "paired";
      session.updatedAt = now();
      pairMemory.set(session.id, session);
    }
    return json({ id: session.id, status: "paired", deviceToken });
  }

  if (request.method === "POST" && url.pathname === "/api/jobs") {
    const body = await request.json().catch(() => ({}));
    const prompt = String(body.prompt || "").trim();
    const images = Array.isArray(body.images) ? body.images.filter((image) => image && typeof image.data === "string" && image.data.length <= 7_000_000) : [];
    if (!prompt || prompt.length > 4000) return json({ error: "Prompt must contain between 1 and 4000 characters" }, 400);
    const job = {
      id: crypto.randomUUID(),
      pairingCode: randomValue(6),
      deviceToken: String(body.deviceToken || ""),
      prompt,
      status: "generating",
      createdAt: now()
    };
    try {
      job.design = await generateDesign(prompt, images, env);
      job.status = "waiting_for_plugin";
      await saveJob(env, job);
      return json({ id: job.id, pairingCode: body.deviceToken ? null : job.pairingCode, status: job.status });
    } catch (error) {
      console.error("AI generation failed", error);
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
    return json({ id: job.id, status: job.status, pairingCode: job.pairingCode, deviceToken: job.deviceToken || null, figmaUrl: job.figmaUrl || null, error: job.error || null });
  }

  if (request.method === "POST" && url.pathname === "/api/plugin/claim") {
    const body = await request.json().catch(() => ({}));
    const pairingCode = String(body.pairingCode || "").toUpperCase();
    const deviceToken = String(body.deviceToken || "");
    let jobs;
    if (env.DB) {
      const result = deviceToken
        ? await env.DB.prepare("SELECT * FROM jobs WHERE status = 'waiting_for_plugin' AND device_token = ? ORDER BY created_at ASC LIMIT 1").bind(deviceToken).all()
        : await env.DB.prepare("SELECT * FROM jobs WHERE status = 'waiting_for_plugin' AND pairing_code = ? LIMIT 1").bind(pairingCode).all();
      jobs = result.results;
    } else {
      jobs = [...memory.values()];
    }
    const job = jobs.find((item) => item.status === "waiting_for_plugin" && ((pairingCode && (item.pairingCode || item.pairing_code) === pairingCode) || (deviceToken && (item.deviceToken || item.device_token) === deviceToken)));
    if (!job) return json({ error: "Pairing code not found or already used" }, 404);
    const normalized = env.DB ? { ...job, deviceToken: job.device_token, design: JSON.parse(job.design_json) } : job;
    normalized.deviceToken = normalized.deviceToken || randomValue(32);
    normalized.status = "processing";
    await updateJob(env, normalized);
    return json({ id: normalized.id, prompt: normalized.prompt, deviceToken: normalized.deviceToken, design: normalized.design });
  }

  if (request.method === "POST" && url.pathname.match(/^\/api\/jobs\/[^/]+\/complete$/)) {
    const id = url.pathname.split("/")[3];
    const job = await getJob(env, id);
    if (!job) return json({ error: "Job not found" }, 404);
    const body = await request.json().catch(() => ({}));
    job.status = body.error ? "error" : "complete";
    job.error = body.error || null;
    job.figmaUrl = body.figmaUrl || null;
    job.deviceToken = body.deviceToken || job.deviceToken || null;
    await updateJob(env, job);
    return json({ ok: true });
  }

  return json({ error: "Not found" }, 404);
};

export default {
  async fetch(request, env) {
    try {
      return await route(request, env);
    } catch (error) {
      console.error("Worker request failed", error);
      return json({ error: "Unexpected server error" }, 500);
    }
  }
};
