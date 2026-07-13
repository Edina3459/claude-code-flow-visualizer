import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
  Bot, BookOpen, TerminalSquare, Plug, Database, Compass, CalendarClock, Webhook,
  AlertTriangle, XCircle, Info, Github, FolderUp, Play, X, ZoomIn, ZoomOut, Maximize2,
  KeyRound, Loader2, ChevronRight, FileText, Search, GitBranch, Sparkles
} from "lucide-react";

/* ------------------------------------------------------------------ */
/* Design tokens — palette is functional: hue encodes node type        */
/* ------------------------------------------------------------------ */

const FONTS = `
@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=Space+Grotesk:wght@500;600;700&display=swap');
.afv-mono { font-family: 'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace; }
.afv-disp { font-family: 'Space Grotesk', ui-sans-serif, system-ui, sans-serif; }
.afv-body { font-family: ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif; }
.afv-clamp2 { display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
.afv-scroll::-webkit-scrollbar { width:8px; height:8px; }
.afv-scroll::-webkit-scrollbar-thumb { background:#24334f; border-radius:8px; }
.afv-scroll::-webkit-scrollbar-track { background:transparent; }
@keyframes afvDash { to { stroke-dashoffset: -14; } }
@media (prefers-reduced-motion: reduce) { .afv-flow { animation: none !important; } }
`;

const TYPE_META = {
  entry:     { label: "ENTRY · CLAUDE.md", color: "#34D399", Icon: Compass },
  agent:     { label: "AGENT",             color: "#818CF8", Icon: Bot },
  skill:     { label: "SKILL",             color: "#FBBF24", Icon: BookOpen },
  command:   { label: "COMMAND",           color: "#22D3EE", Icon: TerminalSquare },
  connector: { label: "MCP CONNECTOR",     color: "#E879F9", Icon: Plug },
  storage:   { label: "MEMORY / STORE",    color: "#FB923C", Icon: Database },
  scheduler: { label: "SCHEDULER",         color: "#38BDF8", Icon: CalendarClock },
  hooks:     { label: "HOOKS",             color: "#94A3B8", Icon: Webhook },
};

const EDGE_STYLE = {
  delegation: { color: "#818CF8", dash: "",       w: 1.8, anim: false },
  auto:       { color: "#64748B", dash: "2 5",    w: 1.2, anim: false },
  related:    { color: "#64748B", dash: "1 6",    w: 1.0, anim: false },
  skill:      { color: "#FBBF24", dash: "7 5",    w: 1.6, anim: false },
  mcp:        { color: "#E879F9", dash: "2 4",    w: 1.6, anim: false },
  memory:     { color: "#FB923C", dash: "8 4 2 4",w: 1.6, anim: false },
  command:    { color: "#22D3EE", dash: "",       w: 1.6, anim: false },
  schedule:   { color: "#38BDF8", dash: "10 6",   w: 1.8, anim: true  },
  hook:       { color: "#94A3B8", dash: "1 4",    w: 1.2, anim: false },
};

/* ------------------------------------------------------------------ */
/* Small utils                                                         */
/* ------------------------------------------------------------------ */

const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const uid = (() => { let n = 0; return (p) => `${p}_${++n}`; })();

/* deliberate reference: backticked, @tagged, "<name> agent/skill", or an
   explicit delegation verb — the signal that a mention is a wiring, not prose */
const strongRefRe = (n) => new RegExp(
  "\\u0060" + n + "\\u0060" +
  "|@" + n + "\\b" +
  `|\\b${n}[- ](?:sub)?agent\\b|\\b${n} skill\\b` +
  `|\\b(?:use|invoke|call|run|dispatch(?:es)?\\s+to|delegate(?:s|d)?(?:\\s+it)?\\s+to|hand(?:s)?\\s*off\\s+to|route(?:s)?\\s+to)\\s+(?:the\\s+)?${n}\\b`,
  "i");
function mentionsStrong(text, name) {
  if (!text || !name || name.length < 2) return false;
  return strongRefRe(escRe(name)).test(text);
}
function mentions(text, name) {
  if (!text || !name || name.length < 2) return false;
  const n = escRe(name);
  /* distinctive slugs ("api-designer", "Sales Coach") match on custom word
     boundaries; short generic names ("go", "react") only count when the text
     references them deliberately — otherwise prose mentions of common words
     wire everything to everything. */
  if (/[-_. ]/.test(name) || name.length >= 10)
    return new RegExp(`(^|[^\\w-])${n}([^\\w-]|$)`, "i").test(text);
  return mentionsStrong(text, name);
}

/* ------------------------------------------------------------------ */
/* Minimal YAML-frontmatter parser (flat keys, lists, block scalars)   */
/* ------------------------------------------------------------------ */

function parseFrontmatter(text) {
  const out = { data: {}, body: text || "", raw: text || "", hasFM: false };
  if (!text) return out;
  const m = text.match(/^\uFEFF?---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*\r?\n?/);
  if (!m) return out;
  out.hasFM = true;
  out.body = text.slice(m[0].length);
  const lines = m[1].split(/\r?\n/);
  let key = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const kv = line.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
    if (kv && !line.startsWith(" ") && !line.startsWith("\t")) {
      key = kv[1];
      let val = kv[2].trim();
      if (val === "" ) { out.data[key] = ""; continue; }
      if (val === "|" || val === ">" || val === "|-" || val === ">-") {
        // block scalar: consume indented lines
        const buf = [];
        while (i + 1 < lines.length && (/^\s+\S/.test(lines[i + 1]) || lines[i + 1].trim() === "")) {
          i++; buf.push(lines[i].replace(/^\s{2}/, ""));
        }
        out.data[key] = buf.join(val.startsWith("|") ? "\n" : " ").trim();
        continue;
      }
      out.data[key] = val.replace(/^["']|["']$/g, "");
    } else if (key && /^\s*-\s+/.test(line)) {
      const item = line.replace(/^\s*-\s+/, "").replace(/^["']|["']$/g, "").trim();
      if (!Array.isArray(out.data[key])) out.data[key] = out.data[key] ? [out.data[key]] : [];
      out.data[key].push(item);
    }
  }
  return out;
}

const toToolList = (v) => Array.isArray(v) ? v.map(s => String(s).trim()).filter(Boolean)
  : typeof v === "string" && v.trim() ? v.split(",").map(s => s.trim()).filter(Boolean) : null;

/* ------------------------------------------------------------------ */
/* Path classification: which files in a repo tree matter              */
/* ------------------------------------------------------------------ */

/* Real-world harnesses nest these at any depth (plugins/<name>/agents, monorepo
   sub-packages, dotted .agents dirs) — so match the segment, not the root. */
const skillRe   = /(^|\/)SKILL\.md$/i;
const agentRe   = /(^|\/)\.?agents\/(.+\.md)$/i;
const commandRe = /(^|\/)\.?commands\/(.+\.md)$/i;
const settingsRe = /(^|\/)\.claude\/settings(\.local)?\.json$|(^|\/)hooks\/hooks\.json$/i;
/* vendored agent packs: *.md anywhere under a dir whose name contains "agent"
   (agency-agents/, subagents/, claude-agents/…) — frontmatter-validated later */
const packDirRe = /(^|\/)[^/]*\bagents?\b[^/]*\/.+\.md$/i;
/* repo-hygiene docs that should never become agent candidates */
const DOC_MD = /^(readme|license|licen[cs]e|contributing|changelog|code_of_conduct|security|support|funding|authors|maintainers|governance|roadmap|skill|.*template)([._\- ]|\b)/i;

function classifyPath(path) {
  const base = path.split("/").pop();
  if (/^CLAUDE\.md$/i.test(path) || /^\.claude\/CLAUDE\.md$/i.test(path)) return "claudemd";
  if (skillRe.test(path))   return "skill";
  if (agentRe.test(path)   && !DOC_MD.test(base)) return "agent";
  if (commandRe.test(path) && !DOC_MD.test(base)) return "command";
  if (packDirRe.test(path) && !DOC_MD.test(base) && !/(^|\/)node_modules\//i.test(path)) return "packmd";
  if (settingsRe.test(path)) return "settings";
  if (/(^|\/)\.mcp\.json$/i.test(path)) return "mcp";
  if (/^\.github\/workflows\/[^/]+\.ya?ml$/i.test(path)) return "workflow";
  if (/\.md$/i.test(path) && !DOC_MD.test(base) && !/(^|\/)(node_modules|\.github)\//i.test(path)) return "rootmd";
  return null;
}

/* ------------------------------------------------------------------ */
/* files[{path, content}]  ->  project model                           */
/* ------------------------------------------------------------------ */

function buildProject(files, meta = {}) {
  const p = { meta, claudeMd: null, agents: [], skills: [], commands: [],
              connectors: [], hooks: [], schedulers: [], settings: null,
              unmapped: [], counts: {} };
  const seenAgentNames = new Set();
  const ids = new Set();
  const uid = (base) => { let id = base, i = 2; while (ids.has(id)) id = base + "~" + i++; ids.add(id); return id; };
  const asText = (v) => v == null ? "" : Array.isArray(v) ? v.map(x => (x == null ? "" : String(x))).join(" ") : String(v);

  for (const f of files) {
    const kind = f.kind || classifyPath(f.path);
    if (kind === "claudemd") {
      p.claudeMd = { path: f.path, raw: f.content };
    } else if (kind === "agent" || kind === "packmd" || kind === "rootmd") {
      const fm = parseFrontmatter(f.content);
      if (kind !== "agent" && !(fm.hasFM && fm.data.name && fm.data.description)) { p.unmapped.push({ path: f.path, why: "markdown without agent frontmatter" }); continue; }
      const base = f.path.split("/").pop().replace(/\.md$/i, "");
      const name = asText(fm.data.name || base).trim();
      const { name: _n, description, model, tools, ...extra } = fm.data;
      p.agents.push({
        id: uid("ag:" + name), type: "agent", name,
        description: asText(description), model: model == null ? null : asText(model),
        tools: toToolList(tools), extra, body: fm.body, raw: f.content, path: f.path,
        dup: seenAgentNames.has(name),
      });
      seenAgentNames.add(name);
    } else if (kind === "skill") {
      const dir = f.path.split("/").slice(-2, -1)[0] || "skill";
      const fm = parseFrontmatter(f.content);
      const name = asText(fm.data.name || dir).trim();
      const { name: _n, description, ...extra } = fm.data;
      p.skills.push({ id: uid("sk:" + name), type: "skill", name, description: asText(description),
        extra, body: fm.body, raw: f.content, path: f.path });
    } else if (kind === "command") {
      const rel = (f.path.match(commandRe)?.[2] || f.path.split("/").pop()).replace(/\.md$/i, "");
      const name = rel.split("/").join(":");  // Claude Code namespaces nested commands as /dir:file
      const fm = parseFrontmatter(f.content);
      p.commands.push({ id: uid("cmd:" + name), type: "command", name: "/" + name,
        description: asText(fm.data.description), body: fm.body, raw: f.content, path: f.path });
    } else if (kind === "settings" || kind === "mcp") {
      let json = null;
      try { json = JSON.parse(f.content); } catch { p.unmapped.push({ path: f.path, why: "invalid JSON — preserved verbatim" }); }
      if (!json) continue;
      if (kind === "settings" && !/(^|\/)hooks\/hooks\.json$/i.test(f.path)) p.settings = { path: f.path, raw: f.content, json };
      const servers = json.mcpServers || (kind === "mcp" ? json : null) || {};
      for (const [name, cfg] of Object.entries(servers)) {
        if (typeof cfg !== "object") continue;
        const storage = /(supabase|postgres|sqlite|mysql|redis|memory|database|db$|^db)/i.test(name);
        p.connectors.push({ id: "mc:" + name, type: storage ? "storage" : "connector",
          name, transport: cfg.type || (cfg.url ? "http" : "stdio"),
          detail: cfg.url || cfg.command || "", raw: JSON.stringify(cfg, null, 2), path: f.path });
      }
      if (kind === "settings" && json.hooks) {
        for (const [event, arr] of Object.entries(json.hooks)) {
          (Array.isArray(arr) ? arr : []).forEach(entry =>
            (entry.hooks || []).forEach(h =>
              p.hooks.push({ event, matcher: entry.matcher || "*", command: h.command || h.type || "" })));
        }
      }
    } else if (kind === "workflow") {
      if (!/claude/i.test(f.content)) { p.unmapped.push({ path: f.path, why: "workflow without Claude invocation" }); continue; }
      const cron = f.content.match(/cron:\s*["']?([^"'\n]+)["']?/);
      const nm = f.content.match(/^name:\s*(.+)$/m);
      p.schedulers.push({ id: "sch:" + f.path, type: "scheduler",
        name: (nm?.[1] || f.path.split("/").pop()).trim(),
        cron: cron ? cron[1].trim() : null, raw: f.content, path: f.path });
    } else {
      p.unmapped.push({ path: f.path, why: "outside the .claude contract — preserved" });
    }
  }
  // dedupe connectors by name (settings + .mcp.json may overlap)
  const seen = new Set();
  p.connectors = p.connectors.filter(c => seen.has(c.name) ? false : seen.add(c.name));
  p.counts = { agents: p.agents.length, skills: p.skills.length, commands: p.commands.length,
    connectors: p.connectors.length, hooks: p.hooks.length, schedulers: p.schedulers.length,
    unmapped: p.unmapped.length };
  return p;
}

/* ------------------------------------------------------------------ */
/* project -> nodes + edges                                            */
/* ------------------------------------------------------------------ */

function buildGraph(project) {
  const nodes = [];
  const edges = [];
  const seenEdge = new Set();
  const addEdge = (from, to, type) => {
    if (!from || !to || from === to) return;
    const k = from + "→" + to + ":" + type;
    if (seenEdge.has(k)) return;
    seenEdge.add(k);
    edges.push({ id: k, from, to, type });
  };

  const entry = { id: "__entry", type: "entry",
    name: project.meta.repo ? project.meta.repo : "CLAUDE.md",
    description: project.claudeMd ? firstProse(project.claudeMd.raw) : "No CLAUDE.md found at project root.",
    raw: project.claudeMd?.raw || "", path: project.claudeMd?.path || "(missing)" };
  nodes.push(entry);

  project.schedulers.forEach(s => nodes.push(s));
  if (project.hooks.length) nodes.push({ id: "__hooks", type: "hooks", name: "hooks",
    description: project.hooks.length + " lifecycle hook(s) from settings.json",
    hooks: project.hooks, raw: project.settings?.raw || "", path: project.settings?.path || ".claude/settings.json" });
  project.commands.forEach(c => nodes.push(c));
  project.agents.forEach(a => nodes.push(a));
  project.skills.forEach(s => nodes.push(s));
  project.connectors.forEach(c => nodes.push(c));

  const cm = project.claudeMd?.raw || "";
  const agentByName = Object.fromEntries(project.agents.map(a => [a.name, a]));

  for (const a of project.agents) {
    if (mentions(cm, a.name)) addEdge("__entry", a.id, mentionsStrong(cm, a.name) ? "delegation" : "related");
    for (const b of project.agents) if (b !== a && mentions(a.body, b.name))
      addEdge(a.id, b.id, mentionsStrong(a.body, b.name) ? "delegation" : "related");
    for (const s of project.skills)  if (mentions(a.body, s.name)) addEdge(a.id, s.id, "skill");
    for (const c of project.connectors) {
      const viaTools = (a.tools || []).some(t => t.toLowerCase().startsWith("mcp__" + c.name.toLowerCase()));
      if (viaTools || mentions(a.body, c.name)) addEdge(a.id, c.id, c.type === "storage" ? "memory" : "mcp");
    }
  }
  for (const s of project.skills) {
    if (mentions(cm, s.name)) addEdge("__entry", s.id, "skill");
    for (const c of project.connectors) if (mentions(s.body, c.name)) addEdge(s.id, c.id, c.type === "storage" ? "memory" : "mcp");
  }
  for (const c of project.connectors) if (mentions(cm, c.name)) addEdge("__entry", c.id, c.type === "storage" ? "memory" : "mcp");
  for (const cmd of project.commands) {
    let hit = false;
    for (const a of project.agents) if (mentions(cmd.body, a.name)) { addEdge(cmd.id, a.id, "command"); hit = true; }
    for (const s of project.skills) if (mentions(cmd.body, s.name)) addEdge(cmd.id, s.id, "skill");
    if (!hit) addEdge(cmd.id, "__entry", "command");
  }
  project.schedulers.forEach(s => addEdge(s.id, "__entry", "schedule"));
  if (project.hooks.length) addEdge("__hooks", "__entry", "hook");

  // keep every agent reachable: faint auto-trigger wire from entry
  // (skipped for big role packs — 200 wires from one node is just noise)
  const hasIn = new Set(edges.map(e => e.to));
  const orphanAgents = project.agents.filter(a => !hasIn.has(a.id));
  if (orphanAgents.length <= 40) for (const a of orphanAgents) addEdge("__entry", a.id, "auto");
  for (const s of project.skills) if (!edges.some(e => e.to === s.id)) s.orphan = true;

  return { nodes, edges, agentByName };
}

function firstProse(md) {
  if (!md) return "";
  for (const line of md.split(/\r?\n/)) {
    const t = line.trim();
    if (t && !t.startsWith("#") && !t.startsWith("---") && !t.startsWith("<")) return t.replace(/[*_`]/g, "");
  }
  return "";
}

/* ------------------------------------------------------------------ */
/* Layered layout: entry → agents (BFS depth) → skills → connectors    */
/* ------------------------------------------------------------------ */

const NODE_W = { entry: 216, agent: 208, skill: 188, command: 180, connector: 188, storage: 188, scheduler: 196, hooks: 172 };
const NODE_H = { entry: 92, agent: 88, skill: 76, command: 64, connector: 72, storage: 72, scheduler: 72, hooks: 56 };

function layoutGraph(nodes, edges) {
  if (!nodes.length) return { positions: {}, size: { w: 900, h: 600 } };
  const depth = { __entry: 0 };
  const agents = nodes.filter(n => n.type === "agent");
  const deleg = edges.filter(e => e.type === "delegation" || e.type === "auto");
  let frontier = ["__entry"], d = 0, guard = 0;
  const placed = new Set(["__entry"]);
  while (frontier.length && guard++ < 50) {
    const next = [];
    for (const e of deleg) if (frontier.includes(e.from) && !placed.has(e.to)) { depth[e.to] = d + 1; placed.add(e.to); next.push(e.to); }
    frontier = next; d++;
  }
  let maxA = 1;
  for (const a of agents) { if (depth[a.id] == null) depth[a.id] = 1; maxA = Math.max(maxA, depth[a.id]); }
  for (const n of nodes) {
    if (n.type === "skill") depth[n.id] = maxA + 1;
    else if (n.type === "connector" || n.type === "storage") depth[n.id] = maxA + (nodes.some(x => x.type === "skill") ? 2 : 1);
    else if (n.type === "scheduler" || n.type === "hooks" || n.type === "command") depth[n.id] = 0;
    else if (depth[n.id] == null) depth[n.id] = 1;
  }
  // group by column
  const cols = {};
  for (const n of nodes) (cols[depth[n.id]] = cols[depth[n.id]] || []).push(n);
  // column 0 ordering: entry, schedulers, commands, hooks
  const rank0 = { entry: 0, scheduler: 1, command: 2, hooks: 3 };
  (cols[0] || []).sort((a, b) => (rank0[a.type] ?? 9) - (rank0[b.type] ?? 9) || a.name.localeCompare(b.name));
  // barycenter pass for other columns
  const posIndex = {};
  (cols[0] || []).forEach((n, i) => posIndex[n.id] = i);
  const maxD = Math.max(...Object.values(depth));
  for (let c = 1; c <= maxD; c++) {
    const col = cols[c] || [];
    col.sort((a, b) => bary(a) - bary(b) || a.name.localeCompare(b.name));
    col.forEach((n, i) => posIndex[n.id] = i);
    function bary(n) {
      const ins = edges.filter(e => e.to === n.id && depth[e.from] < c).map(e => posIndex[e.from] ?? 0);
      return ins.length ? ins.reduce((s, v) => s + v, 0) / ins.length : 99;
    }
  }
  const COL_GAP = 128, ROW_GAP = 30, PAD = 60, MAX_PER_COL = 13;
  /* wrap oversized layers (200-agent packs) into several visual columns */
  const visCols = [];
  for (let c = 0; c <= maxD; c++) {
    const arr = cols[c] || [];
    if (!arr.length) continue;
    if (arr.length <= MAX_PER_COL) { visCols.push(arr); continue; }
    const chunks = Math.ceil(arr.length / MAX_PER_COL), per = Math.ceil(arr.length / chunks);
    for (let i = 0; i < arr.length; i += per) visCols.push(arr.slice(i, i + per));
  }
  const heights = visCols.map(arr => arr.reduce((s, n) => s + (NODE_H[n.type] || 72) + ROW_GAP, -ROW_GAP));
  const maxH = Math.max(...heights, 200);
  const positions = {};
  let x = PAD;
  for (let i = 0; i < visCols.length; i++) {
    const arr = visCols[i];
    const w = Math.max(...arr.map(n => NODE_W[n.type] || 190), 0);
    let y = PAD + (maxH - heights[i]) / 2;
    for (const n of arr) { positions[n.id] = { x, y }; y += (NODE_H[n.type] || 72) + ROW_GAP; }
    x += w + COL_GAP;
  }
  return { positions, size: { w: x + PAD, h: maxH + PAD * 2 } };
}

/* ------------------------------------------------------------------ */
/* Validation lints (the "don't break my pipeline" checks)             */
/* ------------------------------------------------------------------ */

function validateProject(project, edges) {
  const w = [];
  const names = new Set([...project.agents, ...project.skills, ...project.commands.map(c => ({ name: c.name.slice(1) })), ...project.connectors].map(n => n.name.toLowerCase()));
  // 1. broken explicit references
  const refRe = /(?:delegate(?:s|d)?\s+(?:it\s+)?to|hand(?:s)?\s+off\s+to|invoke|dispatch(?:es)?\s+to|route(?:s)?\s+to)\s+(?:the\s+)?`?([a-z0-9][a-z0-9_-]{2,})`?/gi;
  const scan = [{ name: "CLAUDE.md", body: project.claudeMd?.raw || "", id: "__entry" },
    ...project.agents.map(a => ({ name: a.name, body: a.body, id: a.id }))];
  for (const s of scan) {
    let m; const re = new RegExp(refRe.source, "gi");
    while ((m = re.exec(s.body))) {
      const t = m[1].toLowerCase();
      if (!names.has(t) && !["them", "the", "each", "another", "a"].includes(t))
        w.push({ level: "error", nodeId: s.id, msg: `${s.name} delegates to \`${m[1]}\`, but no agent or skill with that name exists — this is the #1 way pipelines break.` });
    }
  }
  // 2. duplicates
  project.agents.filter(a => a.dup).forEach(a =>
    w.push({ level: "warn", nodeId: a.id, msg: `Duplicate agent name \`${a.name}\` — inside one project the later definition shadows the earlier one (ignore if these live in separate plugins/sub-projects).` }));
  // 3. vague descriptions (descriptions are triggers)
  for (const n of [...project.agents, ...project.skills]) {
    if (!n.description) w.push({ level: "warn", nodeId: n.id, msg: `\`${n.name}\` has no description — it will never auto-trigger.` });
    else if (n.description.trim().length < 20)
      w.push({ level: "info", nodeId: n.id, msg: `\`${n.name}\`'s description is very short — Claude picks agents/skills by description, so say *when to use it*.` });
  }
  // 4. delegation cycles
  const adj = {};
  edges.filter(e => e.type === "delegation").forEach(e => (adj[e.from] = adj[e.from] || []).push(e.to));
  const state = {}, stack = [];
  const dfs = (v) => {
    state[v] = 1; stack.push(v);
    for (const u of adj[v] || []) {
      if (state[u] === 1) {
        const cyc = stack.slice(stack.indexOf(u)).concat(u);
        w.push({ level: "warn", nodeId: u, msg: `Circular delegation: ${cyc.map(id => id.replace(/^ag:/, "").replace("__entry", "CLAUDE.md")).join(" → ")}. Fine only if this is an intentional scheduled loop through a memory store.` });
        return true;
      }
      if (!state[u] && dfs(u)) return true;
    }
    stack.pop(); state[v] = 2; return false;
  };
  Object.keys(adj).forEach(v => { if (!state[v]) dfs(v); });
  // 5. orphan skills — only meaningful in a harness (agents exist) and not in skill libraries
  const anySkillWired = project.skills.some(s => edges.some(e => e.to === s.id));
  if (project.agents.length && anySkillWired && project.skills.length <= 40)
  for (const s of project.skills) if (!edges.some(e => e.to === s.id))
    w.push({ level: "warn", nodeId: s.id, msg: `Skill \`${s.name}\` is never referenced by CLAUDE.md or any agent — dead weight, or a wiring you forgot.` });
  // 6. reviewer with write access
  for (const a of project.agents)
    if (/review|audit|critic|checker/i.test(a.name) && (a.tools || []).some(t => /^(write|edit|multiedit|bash|notebookedit)$/i.test(t)))
      w.push({ level: "warn", nodeId: a.id, msg: `\`${a.name}\` looks like a validator but has write tools (${a.tools.filter(t => /^(write|edit|multiedit|bash)$/i.test(t)).join(", ")}) — builder and validator roles shouldn't overlap.` });
  // 7. orchestrator without Task tool
  const outDeleg = {};
  edges.filter(e => e.type === "delegation" && e.from !== "__entry").forEach(e => outDeleg[e.from] = (outDeleg[e.from] || 0) + 1);
  for (const a of project.agents)
    if ((outDeleg[a.id] || 0) >= 2 && a.tools && !a.tools.some(t => /^task$/i.test(t)))
      w.push({ level: "error", nodeId: a.id, msg: `\`${a.name}\` delegates to ${outDeleg[a.id]} agents but its tools list omits \`Task\` — it cannot actually spawn subagents.` });
  // 8. unreferenced connectors
  for (const c of project.connectors) if (!edges.some(e => e.to === c.id))
    w.push({ level: "info", nodeId: c.id, msg: `MCP server \`${c.name}\` is configured but nothing in the flow references it.` });
  return w.sort((a, b) => ({ error: 0, warn: 1, info: 2 }[a.level] - { error: 0, warn: 1, info: 2 }[b.level]));
}

/* ------------------------------------------------------------------ */
/* GitHub URL parsing                                                  */
/* ------------------------------------------------------------------ */

function parseGithubUrl(input) {
  const s = (input || "").trim().replace(/\.git$/, "").replace(/\/+$/, "");
  if (!s) return null;
  let m = s.match(/^(?:https?:\/\/)?(?:www\.)?github\.com\/([^/\s]+)\/([^/\s]+)(?:\/(?:tree|blob)\/([^/\s]+)(?:\/(.*))?)?$/i);
  if (m) return { owner: m[1], repo: m[2], branch: m[3] || null, sub: m[4] ? m[4] + "/" : "" };
  m = s.match(/^([\w.-]+)\/([\w.-]+)$/);
  if (m) return { owner: m[1], repo: m[2], branch: null, sub: "" };
  return null;
}

/* ------------------------------------------------------------------ */
/* GitHub loader — three transports, tried in order:                   */
/*   1. GitHub API + raw.githubusercontent (full fidelity, needs net)  */
/*   2. jsDelivr mirror of public repos (no rate limits)               */
/*   3. Claude API relay via its web_fetch tool — works even in        */
/*      sandboxed previews where only api.anthropic.com is reachable   */
/* ------------------------------------------------------------------ */

const NET_BLOCKED = (e) => (e instanceof TypeError) || /failed to fetch|networkerror|load failed/i.test(e?.message || "");
const OFFLINE_HINT = "Download the repo ZIP (GitHub \u2192 Code \u2192 Download ZIP) and drop it on UPLOAD ZIP \u2014 identical graph, fully offline. UPLOAD FOLDER works for local clones.";
const encPath = (p) => p.split("/").map(encodeURIComponent).join("/");
const rawFileUrl = (o, r, b, p) => `https://raw.githubusercontent.com/${o}/${r}/${encodeURIComponent(b)}/${encPath(p)}`;
const jsdFileUrl = (o, r, b, p) => `https://cdn.jsdelivr.net/gh/${o}/${r}@${encodeURIComponent(b)}/${encPath(p)}`;
const jsdTreeUrls = (o, r, b) => [
  `https://data.jsdelivr.com/v1/packages/gh/${o}/${r}@${encodeURIComponent(b)}`,
  `https://data.jsdelivr.com/v1/package/gh/${o}/${r}@${encodeURIComponent(b)}/flat`,
];

async function ghJson(url, token) {
  const res = await fetch(url, { headers: { Accept: "application/vnd.github+json", ...(token ? { Authorization: "Bearer " + token } : {}) } });
  if (res.status === 403 || res.status === 429) {
    const reset = Number(res.headers.get("x-ratelimit-reset")) * 1000;
    const mins = reset ? Math.max(1, Math.ceil((reset - Date.now()) / 60000)) : null;
    const e = new Error("GitHub API rate limit (60/hr per IP without a token)." + (mins ? ` Resets in ~${mins} min.` : ""));
    e.rateLimited = true; throw e;
  }
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub API error ${res.status}`);
  return res.json();
}

/* Accepts both jsDelivr tree shapes: nested /v1/packages and legacy /flat */
function jsdParse(j) {
  if (!j || !Array.isArray(j.files) || !j.files.length) return null;
  const f0 = j.files[0];
  if (typeof f0?.name === "string" && f0.name.startsWith("/")) return j.files.map(f => f.name.slice(1));
  const out = [];
  (function walk(nodes, prefix) {
    for (const n of nodes || []) {
      if (n.type === "directory") walk(n.files, prefix + n.name + "/");
      else if (n.name) out.push(prefix + n.name);
    }
  })(j.files, "");
  return out.length ? out : null;
}

/* Transport 3 — fetch a batch of URLs through the Claude API's web_fetch
   server tool. api.anthropic.com is reachable from artifact previews, so
   this works where direct GitHub/jsDelivr calls are CSP-blocked.        */
async function relayFetch(urls, perDocTokens = 30000) {
  const post = (tools) => fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 1000,
      messages: [{
        role: "user",
        content: "Fetch every URL listed below with the web_fetch tool — exactly one call per URL, in order, with no commentary between calls. When all are fetched, reply with exactly: done\n\n" + urls.join("\n"),
      }],
      tools,
    }),
  });
  let res = await post([{ type: "web_fetch_20250910", name: "web_fetch", max_uses: urls.length + 1, max_content_tokens: perDocTokens }]);
  let data = null;
  try { data = await res.json(); } catch { /* non-JSON error body */ }
  if ((!res.ok || data?.error) && res.status === 400 && /max_content_tokens|max_uses|unexpected|unknown|extra inputs|not permitted/i.test(data?.error?.message || "")) {
    /* some proxies strip optional tool params — retry with the bare tool once */
    res = await post([{ type: "web_fetch_20250910", name: "web_fetch" }]);
    data = null; try { data = await res.json(); } catch { /* ignore */ }
  }
  if (!res.ok || data?.error) {
    const msg = data?.error?.message || `relay HTTP ${res.status}`;
    const e = new Error(msg);
    e.relayDown = (res.status === 400 && /tool|web_fetch/i.test(msg)) ? "unsupported" : true;
    throw e;
  }
  const out = new Map();
  const texts = [];
  const dig = (o) => {   // first string payload in any plausible nesting
    if (o == null) return null;
    if (typeof o === "string") return o;
    if (Array.isArray(o)) { for (const x of o) { const r = dig(x); if (r != null) return r; } return null; }
    if (typeof o === "object") return dig(o.data ?? o.text ?? o.source ?? o.content);
    return null;
  };
  out.attempted = 0;          // tool invocations seen — a 404 result still counts as tool activity
  for (const b of data?.content || []) {
    if (b?.type === "text" && b.text) { texts.push(b.text); continue; }
    if (b?.type !== "web_fetch_tool_result") continue;
    out.attempted++;
    const list = Array.isArray(b.content) ? b.content : [b.content];
    for (const item of list) {
      if (!item || item.type === "web_fetch_tool_error" || item.error_code) continue;
      const url = item.url || item?.content?.url;
      const text = dig(item.content ?? item);
      if (url && typeof text === "string") out.set(url, text);
    }
  }
  out.note = texts.join(" ").trim();   // model commentary — used for diagnostics
  return out;
}
const relayJson = (map, url) => {
  const t = map.get(url);
  if (t == null) return null;
  try { return JSON.parse(t); } catch { /* try base64-wrapped */ }
  try { return JSON.parse(atob(t.replace(/\s+/g, ""))); } catch { return null; }
};

/* Transport 3a — MCP relay. Unlike web_fetch, mcp_servers IS a documented
   capability of the artifact-preview Claude API, and mcp_tool_result blocks
   carry plaintext. Route fetches through public keyless MCP servers that
   expose a URL-fetching tool (GitMCP, the reference "fetch" server). */
async function relayFetchMcp(urls) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 1000,
      messages: [{
        role: "user",
        content:
          "You may have MCP tools available for fetching URLs (e.g. fetch_generic_url_content, fetch, or similar).\n" +
          "Fetch EVERY URL listed below — exactly one tool call per URL, in order, passing the URL as the tool's url argument (request maximum content length if the tool supports it). No commentary between calls. When all are fetched reply with exactly: done\n" +
          "If none of your available tools can fetch URLs, reply with exactly: NOTOOL\n\n" + urls.join("\n"),
      }],
      mcp_servers: [
        { type: "url", url: "https://gitmcp.io/docs", name: "gitmcp" },
        { type: "url", url: "https://remote.mcpservers.org/fetch/mcp", name: "fetch" },
      ],
    }),
  });
  let data = null;
  try { data = await res.json(); } catch { /* non-JSON error body */ }
  if (!res.ok || data?.error) {
    const msg = data?.error?.message || `relay HTTP ${res.status}`;
    const e = new Error(msg);
    e.relayDown = (res.status === 400 && /mcp|server|tool/i.test(msg)) ? "unsupported" : true;
    throw e;
  }
  const out = new Map();
  out.attempted = 0;          // tool invocations seen — distinguishes "toolless model" from "target 404'd"
  const texts = [];
  const useUrl = {};
  const orderQ = [];
  const dig = (o) => {
    if (o == null) return null;
    if (typeof o === "string") return o;
    if (Array.isArray(o)) { for (const x of o) { const r = dig(x); if (r != null) return r; } return null; }
    if (typeof o === "object") return dig(o.data ?? o.text ?? o.source ?? o.content);
    return null;
  };
  for (const b of data?.content || []) {
    if (b?.type === "text" && b.text) { texts.push(b.text); continue; }
    if (b?.type === "mcp_tool_use") {
      out.attempted++;
      const u = b.input?.url || b.input?.uri || null;
      if (b.id) useUrl[b.id] = u;
      orderQ.push(u);
      continue;
    }
    if (b?.type !== "mcp_tool_result") continue;
    const mapped = b.tool_use_id ? useUrl[b.tool_use_id] : null;
    const url = mapped || orderQ[0] || null;
    if (mapped) { const i = orderQ.indexOf(mapped); if (i >= 0) orderQ.splice(i, 1); }
    else orderQ.shift();
    if (b.is_error) continue;
    const text = dig(b.content);
    if (url && typeof text === "string") out.set(url, text);   // "" is a valid (empty) file
  }
  out.note = texts.join(" ").trim();
  return out;
}

async function loadFromGithub(ref, token, onStep) {
  const { owner, repo, sub } = ref;
  onStep({ phase: "Resolving branch…" });

  let branch = ref.branch, paths = null, via = null, relayFlavor = null;
  let directBlocked = false, ghNote = null, treeTruncated = false;
  const trail = [];   // per-transport outcomes, appended to errors so failures name themselves
  const fail = (msg) => new Error(msg + (trail.length ? `  〔${trail.join(" · ")}〕` : ""));
  /* one relay door, two locks: MCP first (documented for this environment),
     web_fetch second (exists on the public API). Remember what worked — and
     what didn't, so a dead transport is probed exactly once. */
  let mcpDead = false, wfDead = false;
  const note = (s) => { if (!trail.includes(s)) trail.push(s); };
  const emptyMap = () => { const m = new Map(); m.note = ""; return m; };
  const relayBatch = async (urls, tokens) => {
    if (relayFlavor === "webfetch") return relayFetch(urls, tokens);
    if (relayFlavor === "mcp") return relayFetchMcp(urls);
    if (!mcpDead) {
      try {
        const m = await relayFetchMcp(urls);
        if (m.size || m.attempted) { relayFlavor = "mcp"; note("MCP relay: OK"); return m; }
        mcpDead = true;   // model executed zero fetch tools — transport truly absent here
        note("MCP relay: " + (m.note ? `model replied without fetching (\u201C${m.note.slice(0, 60)}\u201D)` : "responded, but fetched nothing"));
      } catch (e) {
        mcpDead = true;
        note("MCP relay: " + (e.relayDown === "unsupported" ? "not accepted by this API endpoint" : String(e.message).slice(0, 70)));
      }
    }
    if (wfDead) return emptyMap();
    try {
      const w = await relayFetch(urls, tokens);
      if (w.size || w.attempted) { relayFlavor = "webfetch"; note("web_fetch relay: OK"); }
      else { wfDead = true; note("web_fetch relay: " + (w.note ? `model replied without fetching (\u201C${w.note.slice(0, 60)}\u201D)` : "responded, but fetched nothing")); }
      return w;
    } catch (e) {
      wfDead = true;
      note("web_fetch relay: " + (e.relayDown === "unsupported" ? "tool not enabled on this endpoint" : String(e.message).slice(0, 70)));
      return emptyMap();
    }
  };

  /* 1 — direct GitHub API (honors token, resolves default branch) */
  try {
    const tryTree = (b) => ghJson(`https://api.github.com/repos/${owner}/${repo}/git/trees/${encodeURIComponent(b)}?recursive=1`, token);
    let tree = null;
    if (branch) tree = await tryTree(branch);
    else {
      for (const b of ["main", "master"]) { tree = await tryTree(b); if (tree) { branch = b; break; } }
      if (!tree) {
        const info = await ghJson(`https://api.github.com/repos/${owner}/${repo}`, token);
        if (!info) throw Object.assign(new Error(`Repo ${owner}/${repo} not found` + (token ? "." : " (private repos need a token).")), { notFound: true });
        branch = info.default_branch;
        tree = await tryTree(branch);
      }
    }
    if (tree) {
      paths = (tree.tree || []).filter(t => t.type === "blob").map(t => t.path);
      treeTruncated = !!tree.truncated;
      via = "github";
    }
  } catch (e) {
    if (e.notFound) throw e;
    if (NET_BLOCKED(e)) { directBlocked = true; trail.push("GitHub API: blocked by this preview's network sandbox"); }
    else { ghNote = e.message; trail.push("GitHub API: " + (e.rateLimited ? "rate-limited (shared 60/hr IP)" : e.message)); }
  }

  /* 2 — direct jsDelivr mirror (public repos, no rate limits) */
  if (!paths && !directBlocked) {
    try {
      outer: for (const b of branch ? [branch] : ["main", "master"]) {
        for (const u of jsdTreeUrls(owner, repo, b)) {
          const r = await fetch(u);
          if (!r.ok) continue;
          const got = jsdParse(await r.json().catch(() => null));
          if (got) { paths = got; branch = b; via = "jsdelivr"; break outer; }
        }
      }
    } catch (e) {
      if (NET_BLOCKED(e)) { directBlocked = true; trail.push("jsDelivr mirror: blocked by this preview's network sandbox"); }
      else trail.push("jsDelivr mirror: " + e.message);
    }
    if (!paths && !directBlocked) trail.push("jsDelivr mirror: no public tree at " + (branch || "main/master"));
  }

  /* 3 — relay through the Claude API (sandboxed previews) */
  if (!paths && directBlocked) {
    const cands = branch ? [branch] : ["main", "master"];
    const ghTreeParse = (j) => j && Array.isArray(j.tree) ? j.tree.filter(t => t.type === "blob").map(t => t.path) : null;
    const treeCandidates = (b) => [
      ...jsdTreeUrls(owner, repo, b).map(u => ({ u, parse: jsdParse })),
      { u: `https://api.github.com/repos/${owner}/${repo}/git/trees/${encodeURIComponent(b)}?recursive=1`, parse: ghTreeParse },
    ];
    let lastNote = "";
    try {
      relay: for (const b of cands) {
        for (const { u, parse } of treeCandidates(b)) {
          onStep({ phase: `Sandboxed preview — relaying tree (@${b}) via Claude API…` });
          const map = await relayBatch([u], 120000);
          if (map.note) lastNote = map.note;
          const got = parse(relayJson(map, u));
          if (got && got.length) { paths = got; branch = b; via = "relay"; break relay; }
        }
      }
      if (!paths && !ref.branch) {
        onStep({ phase: "Relaying: resolving default branch…" });
        const infoUrl = `https://api.github.com/repos/${owner}/${repo}`;
        const im = await relayBatch([infoUrl]).catch(() => new Map());
        const db = relayJson(im, infoUrl)?.default_branch;
        if (db && !cands.includes(db)) {
          for (const { u, parse } of treeCandidates(db)) {
            onStep({ phase: `Relaying tree (@${db}) via Claude API…` });
            const map = await relayBatch([u], 120000).catch(() => new Map());
            if (map.note) lastNote = map.note;
            const got = parse(relayJson(map, u));
            if (got && got.length) { paths = got; branch = db; via = "relay"; break; }
          }
        }
      }
    } catch (e) {
      throw fail("GitHub is blocked in this preview and the Claude-API relay couldn't fetch either"
        + (lastNote ? ` — the API's model replied: \u201C${lastNote.slice(0, 110)}\u201D` : "")
        + ". " + OFFLINE_HINT);
    }
    if (!paths) throw fail(lastNote
      ? `This preview has no network route to GitHub — direct fetch is sandboxed and its Claude API runs neither MCP fetch tools nor web_fetch (the model replied: \u201C${lastNote.slice(0, 90)}\u201D). ` + OFFLINE_HINT
      : `Couldn't list ${owner}/${repo}${branch ? "@" + branch : ""} through the relay — it may be private (the relay only sees public repos), empty, or missing that branch. ` + OFFLINE_HINT + (token ? " (Tokens only apply when GitHub is directly reachable.)" : ""));
  }

  if (!paths) throw fail(ghNote
    ? ghNote + " The jsDelivr mirror had no match either — check the repo/branch name, add a token, or retry later."
    : `Couldn't read the file tree of ${owner}/${repo}${branch ? "@" + branch : ""}. Check the repo/branch name${token ? "." : " (private repos need a token)."}`);

  onStep({ phase: "Scanning tree…" });
  const primary = [], rootmd = [];
  let skillSupport = 0, claudeExtras = 0;
  for (let rel of paths) {
    if (sub) { if (!rel.startsWith(sub)) continue; rel = rel.slice(sub.length); }
    const kind = classifyPath(rel);
    if (kind === "rootmd") { rootmd.push({ path: rel }); continue; }
    if (kind) primary.push({ path: rel, kind });
    else if (sub && /\.md$/i.test(rel) && !/(^|\/)\.github\//i.test(rel) && !DOC_MD.test(rel.split("/").pop())) rootmd.push({ path: rel });
    else if (/^(?:\.claude\/)?skills\/[^/]+\//i.test(rel)) skillSupport++;
    else if (/^\.claude\//i.test(rel)) claudeExtras++;
  }
  const hasCore = primary.some(f => ["agent", "skill", "command"].includes(f.kind));
  /* fetch in structural-importance order, with per-kind quotas so a 300-skill
     library can't starve the agents (or vice versa); backfill spare capacity */
  const prio  = { claudemd: 0, settings: 1, mcp: 2, workflow: 3, agent: 4, packmd: 5, command: 6, skill: 7, rootmd: 8 };
  const CAP = 206;
  const sorted = primary.slice().sort((a, b) => (prio[a.kind] ?? 9) - (prio[b.kind] ?? 9));
  let picked = [];
  const take = (kind, limit) => {
    for (const f of sorted) {
      if (picked.length >= CAP || limit <= 0) return;
      if (f.kind === kind) { picked.push(f); limit--; }
    }
  };
  /* structural config first (tiny), then fair shares of the remainder so a
     300-skill library can't starve the agents (or vice versa), then backfill */
  take("claudemd", 4); take("settings", 8); take("mcp", 6); take("workflow", 6);
  const rem = CAP - picked.length;
  const SHARE = { agent: 0.40, packmd: 0.25, command: 0.15, skill: 0.20 };
  for (const k of ["agent", "packmd", "command", "skill"]) take(k, Math.ceil(rem * SHARE[k]));
  if (picked.length < CAP) {
    const inSet = new Set(picked);
    picked = picked.slice();
    for (const f of sorted) { if (picked.length >= CAP) break; if (!inSet.has(f)) { inSet.add(f); picked.push(f); } }
  }
  if (!hasCore && rootmd.length) picked = picked.concat(rootmd.slice(0, 240).map(f => ({ ...f, kind: "rootmd" })));
  if (!picked.length) throw new Error(`No Claude Code config found in ${owner}/${repo}${sub ? "/" + sub : ""} — looked for CLAUDE.md, .claude/agents, .claude/skills, .claude/commands, settings.json, .mcp.json (and root agent .md files).`);

  /* Relay roundtrips are slow — keep the graph-critical files, cap the rest */
  const RELAY_CAP = 72;
  let capped = false;
  if (via === "relay" && picked.length > RELAY_CAP) {
    picked = picked.slice(0, RELAY_CAP);   // already priority-sorted
    capped = true;
  }

  const truncated = treeTruncated || capped || primary.length > picked.length || (!hasCore && rootmd.length > 240);
  const urlFor = (f) => via === "github" ? rawFileUrl(owner, repo, branch, sub + f.path) : jsdFileUrl(owner, repo, branch, sub + f.path);
  const label = via === "relay" ? "Relaying files via Claude API… (slower, sandbox-proof)" : "Downloading files…";
  const have = new Map();
  onStep({ phase: label, done: 0, total: picked.length });

  if (via === "relay") {
    for (let pass = 0; pass < 2; pass++) {
      const todo = picked.filter(f => !have.has(f.path));
      if (!todo.length) break;
      for (let i = 0; i < todo.length; i += 6) {
        const batch = todo.slice(i, i + 6);
        const map = await relayBatch(batch.map(urlFor), 30000).catch(() => new Map());
        for (const f of batch) {
          const text = map.get(urlFor(f));
          if (typeof text === "string") have.set(f.path, { path: f.path, kind: f.kind, content: text });
        }
        onStep({ phase: label, done: have.size, total: picked.length });
      }
    }
  } else {
    let done = 0;
    for (let i = 0; i < picked.length; i += 8) {
      const batch = picked.slice(i, i + 8);
      await Promise.all(batch.map(async f => {
        try {
          const r = await fetch(urlFor(f));
          done++; onStep({ phase: label, done, total: picked.length });
          if (r.ok) have.set(f.path, { path: f.path, kind: f.kind, content: await r.text() });
        } catch { done++; }
      }));
    }
  }
  const files = [...have.values()];
  if (!files.length) throw new Error("Listed the repo but couldn't download any file contents" + (via === "relay" ? " through the relay. Try again — relay fetches occasionally time out." : "."));
  return { files, meta: { owner, repo, branch, sub, source: "github", via, relayFlavor, truncated, treeCount: paths.length, skillSupport, claudeExtras } };
}

/* Folder upload (fully local, no network) */
/* Minimal ZIP reader (native DecompressionStream, no deps) — enough for
   GitHub's "Download ZIP" artifacts: central directory + deflate/stored. */
function readZipEntries(buf) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const u16 = (o) => dv.getUint16(o, true), u32 = (o) => dv.getUint32(o, true);
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65558); i--) {
    if (u32(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("Not a readable ZIP (no end-of-directory record). Use UPLOAD FOLDER instead.");
  const count = u16(eocd + 10), cdOff = u32(eocd + 16);
  if (count === 0xffff || cdOff === 0xffffffff) throw new Error("ZIP64 archives aren't supported — use UPLOAD FOLDER for very large repos.");
  const td = new TextDecoder();
  const entries = [];
  let o = cdOff;
  for (let i = 0; i < count && o + 46 <= buf.length; i++) {
    if (u32(o) !== 0x02014b50) break;
    const method = u16(o + 10), compSize = u32(o + 20), uncompSize = u32(o + 24);
    const nameLen = u16(o + 28), extraLen = u16(o + 30), commentLen = u16(o + 32);
    const localOff = u32(o + 42);
    const path = td.decode(buf.subarray(o + 46, o + 46 + nameLen));
    o += 46 + nameLen + extraLen + commentLen;
    if (path.endsWith("/")) continue;                       // directory entry
    entries.push({
      path, size: uncompSize,
      text: async () => {
        if (uncompSize > 3_000_000) return "";              // guard: config files are small
        if (u32(localOff) !== 0x04034b50) return "";
        const nl = u16(localOff + 26), el = u16(localOff + 28);
        const data = buf.subarray(localOff + 30 + nl + el, localOff + 30 + nl + el + compSize);
        if (method === 0) return td.decode(data);
        if (method !== 8) return "";
        const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
        return await new Response(stream).text();
      },
    });
  }
  return entries;
}

async function loadFromZip(file, onStep) {
  onStep({ phase: "Reading ZIP…" });
  const buf = new Uint8Array(await file.arrayBuffer());
  const entries = readZipEntries(buf);
  if (!entries.length) throw new Error("That ZIP appears to be empty.");
  /* shape entries like the folder-upload path expects and delegate */
  const shaped = entries.map(e => ({ webkitRelativePath: e.path, name: e.path.split("/").pop(), text: e.text }));
  const bundle = await loadFromUpload(shaped, onStep);
  bundle.meta = { ...bundle.meta, owner: "zip", repo: file.name.replace(/\.zip$/i, "") };
  return bundle;
}

async function loadFromUpload(fileList, onStep) {
  const all = Array.from(fileList).map(f => ({ f, path: f.webkitRelativePath || f.name }));
  const strip = (p) => p.includes("/") ? p.slice(p.indexOf("/") + 1) : p;
  const scoreAsIs = all.filter(x => classifyPath(x.path)).length;
  const scoreStripped = all.filter(x => classifyPath(strip(x.path))).length;
  const norm = scoreStripped > scoreAsIs ? strip : (p) => p;
  const picked = all.map(x => ({ ...x, rel: norm(x.path), kind: classifyPath(norm(x.path)) })).filter(x => x.kind).slice(0, 260);
  if (!picked.length) throw new Error("No CLAUDE.md / .claude config recognized in that folder or ZIP. Select the project root (or the repo\u2019s Download-ZIP file).");
  const files = [];
  let done = 0;
  onStep({ phase: "Reading files…", done: 0, total: picked.length });
  for (const x of picked) {
    files.push({ path: x.rel, kind: x.kind, content: await x.f.text() });
    done++; onStep({ phase: "Reading files…", done, total: picked.length });
  }
  return { files, meta: { owner: "local", repo: "upload", branch: "-", sub: "", source: "upload", treeCount: all.length, skillSupport: 0, claudeExtras: 0 } };
}

/* ------------------------------------------------------------------ */
/* Demo harness — runs through the exact same parser pipeline          */
/* ------------------------------------------------------------------ */

const DEMO_FILES = [
  { path: "CLAUDE.md", content: `# Loomline — content ops harness

Loomline turns a Notion backlog of article ideas into published drafts on a daily loop. The \`orchestrator\` agent owns every run: it never writes content itself — it loads pipeline state through the \`state-management\` skill, delegates research to \`researcher\`, drafting to \`writer\`, quality gates to \`copy-reviewer\`, and hands approved pieces to \`notion-sync\`.

## Orchestration rules
- Exactly one entry point: every run starts with \`orchestrator\`.
- Builder and validator never overlap: \`writer\` produces, \`copy-reviewer\` only reads.
- Every run ends by writing \`runs.summary\` back to supabase so run N+1 continues where run N stopped.

## Context rules (keep the loop lean)
- At run start, read only \`topics.pending\` and the latest \`runs.summary\` from supabase — never raw logs.
- Anything older than 3 runs is compacted into \`runs.summary\` via \`state-management\`.
` },
  { path: ".claude/agents/orchestrator.md", content: `---
name: orchestrator
description: Pipeline leader for Loomline. Use at the start of every scheduled run to plan the day's work, delegate to specialist agents, and persist state. Never drafts content itself.
model: opus
tools: Task, Read, TodoWrite
---

You are the run leader. On every invocation:

1. Load state with the \`state-management\` skill — read \`topics.pending\` and the latest \`runs.summary\` from supabase.
2. Pick at most two pending topics. For each, delegate research to the \`researcher\` agent, then drafting to the \`writer\` agent.
3. Send every draft to \`copy-reviewer\`. If it fails review twice, park the topic and move on.
4. Approved drafts go to \`notion-sync\` for publishing.
5. Close the run: write \`runs.summary\` and updated topic statuses back through \`state-management\`.

You never edit files or write prose yourself — plan, delegate, synthesize, persist.
` },
  { path: ".claude/agents/researcher.md", content: `---
name: researcher
description: Gathers sources, quotes and factual grounding for a single article topic. Use when a topic needs background before drafting.
model: sonnet
tools: WebSearch, WebFetch, Read
---

For the assigned topic, collect 5–8 primary sources with one-line takeaways, then a short outline. Prefer original reporting over aggregators. Return a research brief only — no prose drafting, no state writes; the run leader persists results.
` },
  { path: ".claude/agents/writer.md", content: `---
name: writer
description: Drafts a full article from a research brief. Use after research is complete for a topic and a brief exists.
model: sonnet
tools: Read, Write, Edit
---

Turn the research brief into a 900–1200 word draft following the \`style-guide\` skill. One draft file per topic under drafts/. Flag any claim the brief does not support instead of inventing sources.
` },
  { path: ".claude/agents/copy-reviewer.md", content: `---
name: copy-reviewer
description: Read-only quality gate for drafts. Use after a draft is written and before anything is published.
model: sonnet
tools: Read, Grep
---

Review the draft against the \`review-checklist\` skill. Return APPROVE or a numbered fix list. You have no write tools by design — never attempt edits; report instead.
` },
  { path: ".claude/agents/notion-sync.md", content: `---
name: notion-sync
description: Publishes approved drafts to the Notion content database and updates their status. Use only for drafts that passed review.
tools: Read, mcp__notion__search, mcp__notion__create_page, mcp__notion__update_page
---

Follow the \`notion-sync-procedure\` skill exactly: locate the topic's card in notion, attach the draft, flip status to Ready, and report the page URL back to the run leader.
` },
  { path: ".claude/skills/state-management/SKILL.md", content: `---
name: state-management
description: Read and write Loomline pipeline state in supabase. Use at the start and end of every run, and whenever compacting old context.
---

## Read (run start)
Query the supabase \`topics\` table for status = pending, and \`runs\` for the latest summary row. Load nothing else into context.

## Write (run end)
Upsert processed topics; insert one \`runs\` row: timestamp, status, summary (≤ 300 words). Delete raw notes after compaction.
` },
  { path: ".claude/skills/style-guide/SKILL.md", content: `---
name: style-guide
description: House writing style for Loomline drafts. Use whenever drafting or editing article prose.
---

Active voice, short paragraphs, one idea per section. Headlines ≤ 9 words. Every statistic gets an inline source. No em-dash chains, no filler intros.
` },
  { path: ".claude/skills/review-checklist/SKILL.md", content: `---
name: review-checklist
description: Quality gate procedure for draft review. Use when reviewing any draft before publish.
---

1. Every claim traces to the research brief.
2. Structure matches the outline; no orphan sections.
3. Style-guide compliance (voice, headline length, sourcing).
4. Verdict: APPROVE, or a numbered fix list — never edit the draft.
` },
  { path: ".claude/skills/notion-sync-procedure/SKILL.md", content: `---
name: notion-sync-procedure
description: Exact steps for publishing an approved draft into the Notion content database. Use when moving a draft to Ready.
---

1. Search notion for the topic card by slug.
2. Append the draft as page content; set Status = Ready, PublishedAt = today.
3. Return the page URL. If the card is missing, create it in the Content DB first.
` },
  { path: ".claude/skills/release-checklist/SKILL.md", content: `---
name: release-checklist
description: Steps for cutting a public Loomline release. Use when tagging a new version of the harness.
---

1. All lints green. 2. Round-trip test passes. 3. Tag, changelog, announce.
` },
  { path: ".claude/commands/run-pipeline.md", content: `Kick off a full pipeline run now: start the \`orchestrator\` agent with today's date, then report the run summary and any parked topics when it finishes.
` },
  { path: ".claude/commands/status.md", content: `Read the latest \`runs.summary\` from supabase via the \`state-management\` skill and print a one-screen status report: pending topics, last run outcome, parked items.
` },
  { path: ".claude/settings.json", content: `{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [
          { "type": "command", "command": "npx markdownlint-cli2 'drafts/**/*.md'" }
        ]
      }
    ]
  }
}
` },
  { path: ".mcp.json", content: `{
  "mcpServers": {
    "notion": { "type": "http", "url": "https://mcp.notion.com/mcp" },
    "supabase": { "command": "npx", "args": ["-y", "@supabase/mcp-server-supabase"] }
  }
}
` },
  { path: ".github/workflows/daily-run.yml", content: `name: Loomline daily run
on:
  schedule:
    - cron: "0 6 * * *"
  workflow_dispatch: {}
jobs:
  run:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: anthropics/claude-code-action@v1
        with:
          prompt: "/run-pipeline"
` },
  { path: ".claude/statusline.sh", content: `#!/usr/bin/env bash
echo "loomline $(date +%H:%M)"
` },
];

/* ================================================================== */
/* UI                                                                  */
/* ================================================================== */

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

function Dot({ color }) { return <span className="inline-block w-2 h-2 rounded-full shrink-0" style={{ background: color }} />; }

function LevelIcon({ level, size = 13 }) {
  if (level === "error") return <XCircle size={size} className="text-rose-400 shrink-0" />;
  if (level === "warn") return <AlertTriangle size={size} className="text-amber-400 shrink-0" />;
  return <Info size={size} className="text-sky-400 shrink-0" />;
}

/* ---------------- edges ---------------- */

function edgePath(from, to) {
  const x1 = from.x + from.w, y1 = from.y + from.h / 2;
  const x2 = to.x, y2 = to.y + to.h / 2;
  if (x2 >= x1 + 24) {
    const dx = Math.max(46, (x2 - x1) / 2);
    return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
  }
  const midY = Math.max(y1, y2) + 64;
  const mx = (x1 + x2) / 2;
  return `M ${x1} ${y1} C ${x1 + 60} ${y1}, ${x1 + 60} ${midY}, ${mx} ${midY} C ${x2 - 60} ${midY}, ${x2 - 60} ${y2}, ${x2} ${y2}`;
}

function EdgesLayer({ edges, positions, nodeById, size, activeId }) {
  const anyActive = Boolean(activeId);
  return (
    <svg width={size.w} height={size.h} className="absolute left-0 top-0 overflow-visible pointer-events-none">
      <defs>
        {Object.entries(EDGE_STYLE).map(([t, s]) => (
          <marker key={t} id={"arr-" + t} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M 0 1 L 9 5 L 0 9" fill="none" stroke={s.color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </marker>
        ))}
      </defs>
      {edges.map(e => {
        const a = positions[e.from], b = positions[e.to];
        const na = nodeById[e.from], nb = nodeById[e.to];
        if (!a || !b || !na || !nb) return null;
        const s = EDGE_STYLE[e.type] || EDGE_STYLE.delegation;
        const active = anyActive && (e.from === activeId || e.to === activeId);
        const d = edgePath({ ...a, w: NODE_W[na.type] || 190, h: NODE_H[na.type] || 72 }, { ...b, w: NODE_W[nb.type] || 190, h: NODE_H[nb.type] || 72 });
        return (
          <g key={e.id} opacity={anyActive ? (active ? 1 : 0.14) : (e.type === "auto" ? 0.4 : 0.62)}>
            {active && <path d={d} fill="none" stroke={s.color} strokeWidth={s.w + 4} opacity="0.16" />}
            <path d={d} fill="none" stroke={s.color} strokeWidth={active ? s.w + 0.7 : s.w}
              strokeDasharray={s.dash || undefined} markerEnd={`url(#arr-${e.type})`}
              className={s.anim ? "afv-flow" : undefined}
              style={s.anim ? { animation: "afvDash 1.2s linear infinite" } : undefined} />
          </g>
        );
      })}
    </svg>
  );
}

/* ---------------- node card ---------------- */

function NodeCard({ node, pos, selected, onPointerDown, onHover }) {
  const meta = TYPE_META[node.type] || TYPE_META.agent;
  const w = NODE_W[node.type] || 190, h = NODE_H[node.type] || 72;
  const { Icon } = meta;
  return (
    <div
      onPointerDown={(e) => onPointerDown(e, node.id)}
      onMouseEnter={() => onHover(node.id)} onMouseLeave={() => onHover(null)}
      className="absolute rounded-xl px-3 py-2 select-none cursor-grab active:cursor-grabbing transition-shadow"
      style={{
        left: pos.x, top: pos.y, width: w, height: h,
        background: "rgba(15,27,49,0.94)",
        borderStyle: "solid",
        borderWidth: "1px 1px 1px 3px",
        borderColor: `${meta.color}${selected ? "AA" : "40"} ${meta.color}${selected ? "AA" : "40"} ${meta.color}${selected ? "AA" : "40"} ${meta.color}`,
        boxShadow: selected ? `0 0 0 1.5px ${meta.color}, 0 12px 40px -10px ${meta.color}66` : "0 4px 18px -8px rgba(0,0,0,0.7)",
      }}>
      <div className="flex items-center gap-1.5">
        <Icon size={13} style={{ color: meta.color }} className="shrink-0" />
        <span className="afv-mono text-[8.5px] tracking-[0.14em]" style={{ color: meta.color + "CC" }}>{meta.label}</span>
        {node.orphan && <AlertTriangle size={11} className="text-amber-400 ml-auto shrink-0" />}
        {node.dup && <XCircle size={11} className="text-rose-400 ml-auto shrink-0" />}
      </div>
      <div className="afv-mono text-[12.5px] font-medium text-slate-100 truncate mt-0.5">{node.name}</div>
      {(node.type === "agent" || node.type === "skill" || node.type === "entry") && (
        <div className="afv-body text-[10.5px] leading-snug text-slate-400 afv-clamp2 mt-0.5">
          {node.description || <span className="italic text-slate-500">no description</span>}
        </div>
      )}
      {node.type === "agent" && (
        <div className="absolute bottom-1.5 left-3 right-2 flex items-center gap-1.5 overflow-hidden">
          {node.model && <span className="afv-mono text-[8.5px] px-1 py-px rounded border" style={{ borderColor: meta.color + "55", color: meta.color }}>{node.model}</span>}
          {node.tools && <span className="afv-mono text-[8.5px] text-slate-500">{node.tools.length} tools</span>}
          {!node.tools && <span className="afv-mono text-[8.5px] text-slate-600">inherits all tools</span>}
        </div>
      )}
      {(node.type === "connector" || node.type === "storage") && (
        <div className="afv-mono text-[9px] text-slate-500 truncate mt-0.5">{node.transport}{node.type === "storage" ? " · persists state" : ""}</div>
      )}
      {node.type === "scheduler" && (
        <div className="afv-mono text-[9.5px] truncate mt-0.5" style={{ color: meta.color }}>{node.cron ? "cron " + node.cron : "workflow trigger"}</div>
      )}
      {node.type === "hooks" && (
        <div className="afv-mono text-[9px] text-slate-500 truncate">{node.hooks?.length} hook(s)</div>
      )}
      {node.type === "command" && (
        <div className="afv-body text-[10px] text-slate-500 truncate">{node.description || firstProse(node.body)?.slice(0, 60)}</div>
      )}
    </div>
  );
}

/* ---------------- raw file view with light highlighting ------------ */

function RawFile({ raw }) {
  const lines = (raw || "").split("\n");
  let fmEnd = -1;
  if (lines[0]?.trim() === "---") { for (let i = 1; i < lines.length; i++) if (lines[i].trim() === "---") { fmEnd = i; break; } }
  return (
    <pre className="afv-mono text-[11px] leading-[1.65] whitespace-pre-wrap break-words">
      {lines.map((ln, i) => {
        let el;
        if ((i === 0 || i === fmEnd) && fmEnd > 0) el = <span className="text-slate-600">{ln}</span>;
        else if (i > 0 && i < fmEnd) {
          const m = ln.match(/^(\s*[\w-]+\s*:)(.*)$/);
          el = m ? <><span className="text-sky-300">{m[1]}</span><span className="text-slate-300">{m[2]}</span></> : <span className="text-slate-300">{ln}</span>;
        } else if (/^#{1,6}\s/.test(ln)) el = <span className="text-amber-200 font-semibold">{ln}</span>;
        else if (/^\s*(?:[-*]|\d+\.)\s/.test(ln)) el = <span className="text-slate-300">{ln}</span>;
        else el = <span className="text-slate-400">{ln}</span>;
        return (
          <div key={i} className="flex gap-2">
            <span className="text-slate-700 w-6 text-right shrink-0 select-none">{i + 1}</span>
            <span className="min-w-0">{el}</span>
          </div>
        );
      })}
    </pre>
  );
}

/* ---------------- inspector ---------------- */

const EDGE_VERB = { delegation: "delegates to", auto: "auto-triggers", related: "references", skill: "uses skill", mcp: "connects to", memory: "reads / writes", command: "invokes", schedule: "schedules", hook: "wraps" };

function Inspector({ node, edges, nodeById, warnings, onClose, onSelect }) {
  const [tab, setTab] = useState("overview");
  useEffect(() => setTab("overview"), [node?.id]);
  if (!node) return null;
  const meta = TYPE_META[node.type];
  const out = edges.filter(e => e.from === node.id);
  const inn = edges.filter(e => e.to === node.id);
  const mine = warnings.filter(w => w.nodeId === node.id);
  const RefRow = ({ e, dir }) => {
    const other = nodeById[dir === "out" ? e.to : e.from];
    if (!other) return null;
    const om = TYPE_META[other.type];
    return (
      <button onClick={() => onSelect(other.id)}
        className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-white/5 text-left group">
        <Dot color={EDGE_STYLE[e.type]?.color || "#888"} />
        <span className="afv-mono text-[9px] text-slate-500 w-[86px] shrink-0">{EDGE_VERB[e.type] || e.type}</span>
        <span className="afv-mono text-[11px] truncate" style={{ color: om.color }}>{other.name}</span>
        <ChevronRight size={12} className="ml-auto text-slate-600 group-hover:text-slate-400 shrink-0" />
      </button>
    );
  };
  return (
    <div className="w-[370px] shrink-0 border-l border-slate-800/80 flex flex-col" style={{ background: "#0D1729" }}>
      <div className="px-4 pt-3.5 pb-3 border-b border-slate-800/80">
        <div className="flex items-center gap-2">
          <meta.Icon size={14} style={{ color: meta.color }} />
          <span className="afv-mono text-[9px] tracking-[0.16em]" style={{ color: meta.color }}>{meta.label}</span>
          <button onClick={onClose} className="ml-auto p-1 rounded hover:bg-white/10 text-slate-400"><X size={15} /></button>
        </div>
        <div className="afv-mono text-[17px] font-semibold text-slate-100 mt-1 break-all">{node.name}</div>
        <div className="afv-mono text-[9.5px] text-slate-500 mt-0.5 break-all flex items-center gap-1"><FileText size={10} className="shrink-0" />{node.path}</div>
        <div className="flex gap-1 mt-3">
          {["overview", "file"].map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={"afv-mono text-[10px] tracking-wider uppercase px-2.5 py-1 rounded-md border " + (tab === t ? "text-slate-100 border-slate-500 bg-white/5" : "text-slate-500 border-transparent hover:text-slate-300")}>
              {t === "file" ? "source file" : t}
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto afv-scroll px-4 py-3">
        {tab === "file" ? (
          node.raw ? <RawFile raw={node.raw} /> : <div className="afv-body text-[12px] text-slate-500 italic">No underlying file (derived node).</div>
        ) : (
          <div className="space-y-4">
            {mine.length > 0 && (
              <div className="space-y-1.5">
                {mine.map((w, i) => (
                  <div key={i} className="flex gap-2 items-start rounded-lg border border-slate-700/60 bg-slate-900/60 px-2.5 py-2">
                    <LevelIcon level={w.level} />
                    <span className="afv-body text-[11px] text-slate-300 leading-snug">{w.msg}</span>
                  </div>
                ))}
              </div>
            )}
            <div>
              <div className="afv-mono text-[9px] tracking-[0.16em] text-slate-500 mb-1">DESCRIPTION · TRIGGER</div>
              <p className="afv-body text-[12px] leading-relaxed text-slate-300">{node.description || <span className="italic text-slate-500">none — this {node.type} will never auto-trigger.</span>}</p>
            </div>
            {node.type === "agent" && (
              <div>
                <div className="afv-mono text-[9px] tracking-[0.16em] text-slate-500 mb-1.5">MODEL & TOOLS</div>
                <div className="flex flex-wrap gap-1.5">
                  {node.model && <span className="afv-mono text-[10px] px-1.5 py-0.5 rounded border border-indigo-400/50 text-indigo-300">{node.model}</span>}
                  {(node.tools || []).map(t => (
                    <span key={t} className={"afv-mono text-[10px] px-1.5 py-0.5 rounded border " + (t.startsWith("mcp__") ? "border-fuchsia-400/40 text-fuchsia-300" : "border-slate-600 text-slate-300")}>{t}</span>
                  ))}
                  {!node.tools && <span className="afv-body text-[11px] text-slate-500 italic">no tools key — inherits every tool (consider narrowing)</span>}
                </div>
              </div>
            )}
            {(node.type === "connector" || node.type === "storage") && (
              <div>
                <div className="afv-mono text-[9px] tracking-[0.16em] text-slate-500 mb-1">SERVER CONFIG</div>
                <pre className="afv-mono text-[10.5px] text-slate-300 bg-slate-900/70 border border-slate-800 rounded-lg p-2.5 whitespace-pre-wrap break-all">{node.raw}</pre>
              </div>
            )}
            {node.type === "scheduler" && (
              <div>
                <div className="afv-mono text-[9px] tracking-[0.16em] text-slate-500 mb-1">SCHEDULE</div>
                <div className="afv-mono text-[13px] text-sky-300">{node.cron ? "cron  " + node.cron : "manual / event trigger"}</div>
                <p className="afv-body text-[11px] text-slate-500 mt-1">Invokes the harness headlessly — the loop that makes state persistence matter.</p>
              </div>
            )}
            {node.type === "hooks" && (
              <div className="space-y-1.5">
                <div className="afv-mono text-[9px] tracking-[0.16em] text-slate-500 mb-1">LIFECYCLE HOOKS</div>
                {node.hooks.map((h, i) => (
                  <div key={i} className="rounded-lg border border-slate-800 bg-slate-900/60 px-2.5 py-2">
                    <div className="afv-mono text-[10px] text-slate-300">{h.event} <span className="text-slate-500">on</span> <span className="text-cyan-300">{h.matcher}</span></div>
                    <div className="afv-mono text-[10px] text-slate-500 mt-0.5 break-all">$ {h.command}</div>
                  </div>
                ))}
              </div>
            )}
            {node.extra && Object.keys(node.extra).length > 0 && (
              <div>
                <div className="afv-mono text-[9px] tracking-[0.16em] text-slate-500 mb-1">OTHER FRONTMATTER · PRESERVED</div>
                {Object.entries(node.extra).map(([k, v]) => (
                  <div key={k} className="afv-mono text-[10.5px] text-slate-400"><span className="text-sky-300/80">{k}:</span> {Array.isArray(v) ? v.join(", ") : String(v)}</div>
                ))}
              </div>
            )}
            {out.length > 0 && (
              <div>
                <div className="afv-mono text-[9px] tracking-[0.16em] text-slate-500 mb-1">OUTGOING · {out.length}</div>
                <div className="-mx-2">{out.map(e => <RefRow key={e.id} e={e} dir="out" />)}</div>
              </div>
            )}
            {inn.length > 0 && (
              <div>
                <div className="afv-mono text-[9px] tracking-[0.16em] text-slate-500 mb-1">REFERENCED BY · {inn.length}</div>
                <div className="-mx-2">{inn.map(e => <RefRow key={e.id} e={e} dir="in" />)}</div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------------- legend / warnings / loading ---------------- */

function Legend() {
  const rows = ["entry", "agent", "skill", "command", "connector", "storage", "scheduler"];
  const wires = [["delegation", "delegates"], ["related", "references"], ["skill", "uses skill"], ["mcp", "MCP"], ["memory", "state r/w"], ["schedule", "schedule"]];
  return (
    <div className="absolute left-4 bottom-4 rounded-xl border border-slate-800 bg-[#0D1729]/95 px-3 py-2.5 backdrop-blur pointer-events-none">
      <div className="grid grid-cols-2 gap-x-5 gap-y-1">
        <div className="space-y-1">
          {rows.map(t => (
            <div key={t} className="flex items-center gap-1.5">
              <Dot color={TYPE_META[t].color} /><span className="afv-mono text-[8.5px] tracking-wider text-slate-400">{TYPE_META[t].label.split(" ")[0]}</span>
            </div>
          ))}
        </div>
        <div className="space-y-[7px] pt-0.5">
          {wires.map(([t, l]) => (
            <div key={t} className="flex items-center gap-1.5">
              <svg width="26" height="6"><line x1="0" y1="3" x2="26" y2="3" stroke={EDGE_STYLE[t].color} strokeWidth="1.6" strokeDasharray={EDGE_STYLE[t].dash || undefined} /></svg>
              <span className="afv-mono text-[8.5px] tracking-wider text-slate-400">{l}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function WarningsPanel({ warnings, onSelect, onClose }) {
  const order = { error: 0, warn: 1, info: 2 };
  const sortedW = warnings.slice().sort((a, b) => (order[a.level] ?? 3) - (order[b.level] ?? 3));
  const shown = sortedW.slice(0, 150);
  return (
    <div className="absolute left-4 bottom-4 w-[400px] max-h-[48%] rounded-xl border border-slate-700 bg-[#0D1729]/97 backdrop-blur flex flex-col overflow-hidden shadow-2xl">
      <div className="flex items-center gap-2 px-3.5 py-2.5 border-b border-slate-800">
        <AlertTriangle size={13} className="text-amber-400" />
        <span className="afv-mono text-[10px] tracking-[0.14em] text-slate-300">PIPELINE LINTS · {warnings.length}</span>
        <button onClick={onClose} className="ml-auto p-1 rounded hover:bg-white/10 text-slate-400"><X size={14} /></button>
      </div>
      <div className="overflow-y-auto afv-scroll p-2 space-y-1">
        {warnings.length === 0 && <div className="afv-body text-[12px] text-emerald-300/90 px-2 py-2">All checks passed — safe to build on this flow.</div>}
        {shown.map((w, i) => (
          <button key={i} onClick={() => w.nodeId && onSelect(w.nodeId)}
            className="w-full flex gap-2 items-start text-left rounded-lg px-2.5 py-2 hover:bg-white/5 border border-transparent hover:border-slate-700">
            <LevelIcon level={w.level} />
            <span className="afv-body text-[11.5px] leading-snug text-slate-300">{w.msg}</span>
          </button>
        ))}
        {sortedW.length > shown.length && (
          <div className="afv-mono text-[10px] text-slate-500 px-2.5 py-2">+{sortedW.length - shown.length} more — fix the ones above first.</div>
        )}
      </div>
    </div>
  );
}

function LoadingOverlay({ loading }) {
  const pct = loading.total ? Math.round((loading.done / loading.total) * 100) : null;
  return (
    <div className="absolute inset-0 z-40 bg-[#070C18]/70 backdrop-blur-sm flex items-center justify-center">
      <div className="rounded-2xl border border-slate-700 bg-[#0D1729] px-8 py-6 flex flex-col items-center gap-3 w-[300px]">
        <Loader2 size={22} className="text-emerald-400 animate-spin" />
        <div className="afv-mono text-[11px] tracking-wider text-slate-300">{loading.phase}</div>
        {pct != null && (
          <>
            <div className="w-full h-1 rounded-full bg-slate-800 overflow-hidden">
              <div className="h-full bg-emerald-400 transition-all" style={{ width: pct + "%" }} />
            </div>
            <div className="afv-mono text-[9.5px] text-slate-500">{loading.done} / {loading.total} files</div>
          </>
        )}
      </div>
    </div>
  );
}

/* ---------------- empty state ---------------- */

function EmptyState({ error, onDemo, onUploadClick, onZipClick, onExample }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
      <div className="pointer-events-auto max-w-[560px] px-6 text-center flex flex-col items-center">
        <div className="afv-mono text-[10px] tracking-[0.3em] text-emerald-400/90 mb-3">.CLAUDE / FLOW GRAPH</div>
        <h1 className="afv-disp text-[34px] leading-[1.12] font-semibold text-slate-100">
          See the whole harness<br />before you touch it.
        </h1>
        <p className="afv-body text-[13.5px] text-slate-400 mt-3 leading-relaxed">
          Paste a GitHub repo and this maps its <span className="afv-mono text-[12px] text-slate-300">CLAUDE.md</span>, agents, skills, commands, hooks, MCP connectors and schedulers into one wired graph — delegation paths, state stores, dead references and all.
        </p>
        <p className="afv-mono text-[9.5px] tracking-[0.14em] text-slate-500 mt-2.5">
          SANDBOXED PREVIEW WITH NO GITHUB ROUTE? USE GITHUB → CODE → DOWNLOAD ZIP, THEN “UPLOAD ZIP”.
        </p>
        {error && (
          <div className="mt-4 w-full flex items-start gap-2 rounded-xl border border-rose-500/40 bg-rose-500/10 px-3.5 py-2.5 text-left">
            <XCircle size={14} className="text-rose-400 mt-0.5 shrink-0" />
            <span className="afv-body text-[12px] text-rose-200 leading-snug">{error}</span>
          </div>
        )}
        <div className="flex items-center gap-2.5 mt-6 flex-wrap justify-center">
          <button onClick={onDemo} className="flex items-center gap-2 rounded-lg bg-emerald-400 hover:bg-emerald-300 text-[#06251A] afv-mono text-[11.5px] font-semibold tracking-wide px-4 py-2.5">
            <Play size={13} /> LOAD DEMO HARNESS
          </button>
          <button onClick={onZipClick} className="flex items-center gap-2 rounded-lg border border-slate-600 hover:border-slate-400 text-slate-300 afv-mono text-[11.5px] tracking-wide px-4 py-2.5">
            <FolderUp size={13} /> UPLOAD ZIP
          </button>
          <button onClick={onUploadClick} className="flex items-center gap-2 rounded-lg border border-slate-600 hover:border-slate-400 text-slate-300 afv-mono text-[11.5px] tracking-wide px-4 py-2.5">
            <FolderUp size={13} /> UPLOAD FOLDER
          </button>
        </div>
        <button onClick={onExample} className="afv-mono text-[10px] text-slate-500 hover:text-slate-300 mt-4 underline decoration-slate-700 underline-offset-4">
          or try a community pack: github.com/wshobson/agents
        </button>
      </div>
    </div>
  );
}

/* ================================================================== */
/* App                                                                 */
/* ================================================================== */

export default function AgentFlowVisualizer() {
  const [input, setInput] = useState("");
  const [token, setToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [loading, setLoading] = useState(null);
  const [error, setError] = useState(null);
  const [bundle, setBundle] = useState(null);
  const [selected, setSelected] = useState(null);
  const [hover, setHover] = useState(null);
  const [showWarn, setShowWarn] = useState(false);
  const [positions, setPositions] = useState({});
  const [size, setSize] = useState({ w: 1400, h: 900 });
  const [t, setT] = useState({ x: 0, y: 0, k: 1 });

  const outerRef = useRef(null);
  const dragRef = useRef(null);
  const fileRef = useRef(null);
  const zipRef = useRef(null);

  const project = useMemo(() => bundle ? buildProject(bundle.files, bundle.meta) : null, [bundle]);
  const graph = useMemo(() => project ? buildGraph(project) : null, [project]);
  const warnings = useMemo(() => project && graph ? validateProject(project, graph.edges) : [], [project, graph]);
  const nodeById = useMemo(() => graph ? Object.fromEntries(graph.nodes.map(n => [n.id, n])) : {}, [graph]);

  const fitView = useCallback((sz) => {
    const el = outerRef.current; if (!el) return;
    const k = clamp(Math.min(el.clientWidth / sz.w, el.clientHeight / sz.h) * 0.96, 0.12, 1.15);
    setT({ k, x: (el.clientWidth - sz.w * k) / 2, y: Math.max(8, (el.clientHeight - sz.h * k) / 2) });
  }, []);

  useEffect(() => {
    if (!graph) return;
    const { positions: pos, size: sz } = layoutGraph(graph.nodes, graph.edges);
    setPositions(pos); setSize(sz); setSelected(null); setShowWarn(false);
    requestAnimationFrame(() => fitView(sz));
  }, [graph, fitView]);

  /* wheel zoom (non-passive so preventDefault works) */
  useEffect(() => {
    const el = outerRef.current; if (!el) return;
    const onWheel = (e) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const px = e.clientX - rect.left, py = e.clientY - rect.top;
      setT(prev => {
        const k2 = clamp(prev.k * (e.deltaY < 0 ? 1.12 : 0.9), 0.1, 2.6);
        return { k: k2, x: px - (px - prev.x) * (k2 / prev.k), y: py - (py - prev.y) * (k2 / prev.k) };
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const onBgDown = (e) => {
    /* pointer capture retargets pointerup to the container, which kills the
       click event on any button/input overlaid inside the canvas — so never
       start a pan from an interactive element */
    if (e.target.closest?.("button, input, a")) return;
    dragRef.current = { mode: "pan", sx: e.clientX, sy: e.clientY, ox: t.x, oy: t.y, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onNodeDown = (e, id) => {
    e.stopPropagation();
    const p = positions[id];
    dragRef.current = { mode: "node", id, sx: e.clientX, sy: e.clientY, ox: p.x, oy: p.y, moved: false };
    outerRef.current?.setPointerCapture(e.pointerId);
  };
  const onMove = (e) => {
    const d = dragRef.current; if (!d) return;
    const dx = e.clientX - d.sx, dy = e.clientY - d.sy;
    if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true;
    if (d.mode === "pan") setT(prev => ({ ...prev, x: d.ox + dx, y: d.oy + dy }));
    else setPositions(prev => ({ ...prev, [d.id]: { x: d.ox + dx / t.k, y: d.oy + dy / t.k } }));
  };
  const onUp = () => {
    const d = dragRef.current; dragRef.current = null;
    if (d && d.mode === "node" && !d.moved) setSelected(prev => prev === d.id ? null : d.id);
    if (d && d.mode === "pan" && !d.moved) setSelected(null);
  };

  const runLoad = async (fn) => {
    setError(null); setLoading({ phase: "Starting…" });
    try {
      const b = await fn((s) => setLoading(s));
      setBundle(b);
    } catch (err) {
      const msg = err instanceof TypeError && /fetch/i.test(err.message)
        ? "Network is fully blocked here (even the Claude API relay). Load the demo, upload the folder directly, or run this file locally."
        : err.message;
      setError(msg); setBundle(null);
    } finally { setLoading(null); }
  };

  const loadUrl = () => {
    const ref = parseGithubUrl(input);
    if (!ref) { setError("That doesn't look like a GitHub repo. Use github.com/owner/repo, owner/repo, or a /tree/branch/subfolder link."); return; }
    runLoad((step) => loadFromGithub(ref, token.trim() || null, step));
  };
  const loadDemo = () => {
    setError(null);
    setBundle({ files: DEMO_FILES.map(f => ({ ...f, kind: classifyPath(f.path) })), meta: { owner: "demo", repo: "loomline", branch: "main", source: "demo", treeCount: DEMO_FILES.length, skillSupport: 0, claudeExtras: 0 } });
  };
  const onZip = (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (f) runLoad((step) => loadFromZip(f, step));
  };
  const onUpload = (e) => {
    const files = e.target.files;
    if (files?.length) runLoad((step) => loadFromUpload(files, step));
    e.target.value = "";
  };

  const showGraph = !!(graph && graph.nodes.length);
  const emptyLoad = !!(graph && !graph.nodes.length && bundle);
  const emptyMsg = emptyLoad
    ? `Fetched ${bundle.files.length} candidate file${bundle.files.length === 1 ? "" : "s"} from ${bundle.meta.owner}/${bundle.meta.repo}, but none parsed into agents, skills, commands, or Claude config. If the harness lives in a subfolder, paste its /tree/${bundle.meta.branch}/<subfolder> URL.`
    : null;
  const counts = project?.counts;
  const errN = warnings.filter(w => w.level === "error").length;
  const preserved = (counts?.unmapped || 0) + (bundle?.meta.skillSupport || 0) + (bundle?.meta.claudeExtras || 0);
  const zoom = (f) => setT(prev => {
    const el = outerRef.current; if (!el) return prev;
    const px = el.clientWidth / 2, py = el.clientHeight / 2;
    const k2 = clamp(prev.k * f, 0.1, 2.6);
    return { k: k2, x: px - (px - prev.x) * (k2 / prev.k), y: py - (py - prev.y) * (k2 / prev.k) };
  });

  return (
    <div className="h-screen w-full flex flex-col overflow-hidden afv-body" style={{ background: "#0B1220", color: "#CBD5E1" }}>
      <style>{FONTS}</style>

      {/* ---------- command bar ---------- */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-slate-800/80 flex-wrap" style={{ background: "#0D1729" }}>
        <div className="flex items-center gap-2.5 mr-1">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "linear-gradient(135deg,#34D39922,#818CF822)", border: "1px solid #34D39955" }}>
            <GitBranch size={15} className="text-emerald-400" />
          </div>
          <div>
            <div className="afv-mono text-[8px] tracking-[0.24em] text-slate-500">CLAUDE CODE · AGENT HARNESS</div>
            <div className="afv-disp text-[15px] font-semibold text-slate-100 leading-tight">Flow Visualizer</div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-1 min-w-[280px] max-w-[640px]">
          <div className="flex items-center gap-2 flex-1 rounded-lg border border-slate-700 bg-[#0A1424] px-3 py-2 focus-within:border-emerald-500/60">
            <Github size={13} className="text-slate-500 shrink-0" />
            <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === "Enter" && loadUrl()}
              placeholder="github.com/owner/repo · owner/repo · …/tree/branch/subfolder"
              className="bg-transparent outline-none afv-mono text-[11.5px] text-slate-200 placeholder:text-slate-600 flex-1 min-w-0" />
            <button onClick={() => setShowToken(s => !s)} title="Optional GitHub token — raises the 60 req/hr anonymous limit; needed for private repos"
              className={"p-1 rounded hover:bg-white/10 " + (token ? "text-emerald-400" : "text-slate-500")}>
              <KeyRound size={12} />
            </button>
          </div>
          {showToken && (
            <input type="password" value={token} onChange={e => setToken(e.target.value)} placeholder="ghp_… (kept in memory only)"
              className="rounded-lg border border-slate-700 bg-[#0A1424] px-2.5 py-2 afv-mono text-[10.5px] text-slate-200 placeholder:text-slate-600 outline-none w-[190px] focus:border-emerald-500/60" />
          )}
          <button onClick={loadUrl} disabled={!!loading}
            className="rounded-lg bg-emerald-400 hover:bg-emerald-300 disabled:opacity-50 text-[#06251A] afv-mono text-[10.5px] font-semibold tracking-wider px-3.5 py-2">
            VISUALIZE
          </button>
        </div>
        <div className="flex items-center gap-1.5 ml-auto">
          <button onClick={loadDemo} className="flex items-center gap-1.5 rounded-lg border border-slate-700 hover:border-slate-500 text-slate-300 afv-mono text-[10px] tracking-wider px-3 py-2">
            <Play size={11} /> DEMO
          </button>
          <button onClick={() => fileRef.current?.click()} className="flex items-center gap-1.5 rounded-lg border border-slate-700 hover:border-slate-500 text-slate-300 afv-mono text-[10px] tracking-wider px-3 py-2">
            <FolderUp size={11} /> UPLOAD
          </button>
          <button onClick={() => zipRef.current?.click()} className="flex items-center gap-1.5 rounded-lg border border-slate-700 hover:border-slate-500 text-slate-300 afv-mono text-[10px] tracking-wider px-3 py-2">
            <FolderUp size={11} /> ZIP
          </button>
          <input ref={fileRef} type="file" webkitdirectory="" directory="" multiple className="hidden" onChange={onUpload} />
          <input ref={zipRef} type="file" accept=".zip" className="hidden" onChange={onZip} />
        </div>
      </div>

      {/* ---------- parse report strip ---------- */}
      {showGraph && (
        <div className="flex items-center gap-2 px-4 py-1.5 border-b border-slate-800/60 flex-wrap" style={{ background: "#0B1524" }}>
          <span className="flex items-center gap-1.5 afv-mono text-[10px] text-slate-300 rounded-md border border-slate-700 px-2 py-1">
            {bundle.meta.source === "github" ? <Github size={11} className="text-slate-400" /> : bundle.meta.source === "upload" ? <FolderUp size={11} className="text-slate-400" /> : <Sparkles size={11} className="text-emerald-400" />}
            {bundle.meta.owner}/{bundle.meta.repo}<span className="text-slate-600">@{bundle.meta.branch}</span>
            {bundle.meta.via && bundle.meta.via !== "github" && <span className="text-sky-400/80">· via {bundle.meta.via === "relay" ? "Claude relay" + (bundle.meta.relayFlavor === "mcp" ? " (MCP)" : bundle.meta.relayFlavor === "webfetch" ? " (web_fetch)" : "") : "jsDelivr"}</span>}
          </span>
          {[["agents", "agent"], ["skills", "skill"], ["commands", "command"], ["connectors", "connector"], ["hooks", "hooks"], ["schedulers", "scheduler"]].map(([k, ty]) =>
            counts[k] > 0 && (
              <span key={k} className="flex items-center gap-1.5 afv-mono text-[10px] text-slate-400">
                <Dot color={TYPE_META[ty].color} />{counts[k]} {k}
              </span>
            ))}
          {preserved > 0 && <span className="afv-mono text-[10px] text-slate-600">· {preserved} file(s) preserved unmapped</span>}
          {bundle.meta.truncated && <span className="afv-mono text-[10px] text-amber-400/90">· large repo — partial view</span>}
          <button onClick={() => setShowWarn(s => !s)}
            className={"ml-auto flex items-center gap-1.5 rounded-md border px-2.5 py-1 afv-mono text-[10px] tracking-wide " +
              (errN ? "border-rose-500/50 text-rose-300 bg-rose-500/10" : warnings.length ? "border-amber-500/50 text-amber-300 bg-amber-500/10" : "border-emerald-500/40 text-emerald-300 bg-emerald-500/10")}>
            {errN ? <XCircle size={11} /> : warnings.length ? <AlertTriangle size={11} /> : <Search size={11} />}
            {warnings.length ? `${warnings.length} LINT${warnings.length > 1 ? "S" : ""}` : "ALL CHECKS PASS"}
          </button>
        </div>
      )}

      {/* ---------- canvas + inspector ---------- */}
      <div className="flex-1 flex min-h-0">
        <div ref={outerRef} onPointerDown={onBgDown} onPointerMove={onMove} onPointerUp={onUp}
          className="relative flex-1 overflow-hidden touch-none"
          style={{
            backgroundImage: "radial-gradient(rgba(116,139,180,0.16) 1px, transparent 1px)",
            backgroundSize: `${26 * t.k}px ${26 * t.k}px`,
            backgroundPosition: `${t.x}px ${t.y}px`,
            cursor: "grab",
          }}>
          {showGraph && (
            <div className="absolute left-0 top-0" style={{ transform: `translate(${t.x}px, ${t.y}px) scale(${t.k})`, transformOrigin: "0 0", width: size.w, height: size.h }}>
              <EdgesLayer edges={graph.edges} positions={positions} nodeById={nodeById} size={size} activeId={hover || selected} />
              {graph.nodes.map(n => positions[n.id] && (
                <NodeCard key={n.id} node={n} pos={positions[n.id]} selected={selected === n.id}
                  onPointerDown={onNodeDown} onHover={setHover} />
              ))}
            </div>
          )}
          {!showGraph && !loading && (
            <EmptyState error={emptyMsg || error} onDemo={loadDemo} onUploadClick={() => fileRef.current?.click()} onZipClick={() => zipRef.current?.click()}
              onExample={() => { setInput("wshobson/agents"); }} />
          )}
          {showGraph && error && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 flex items-start gap-2 rounded-xl border border-rose-500/40 bg-[#1a0f18f0] px-3.5 py-2.5 max-w-[520px] z-30">
              <XCircle size={14} className="text-rose-400 mt-0.5 shrink-0" />
              <span className="afv-body text-[12px] text-rose-200 leading-snug">{error}</span>
              <button onClick={() => setError(null)} className="text-slate-500 hover:text-slate-300 ml-1"><X size={13} /></button>
            </div>
          )}
          {showGraph && (showWarn ? <WarningsPanel warnings={warnings} onClose={() => setShowWarn(false)} onSelect={(id) => setSelected(id)} /> : <Legend />)}
          {showGraph && (
            <div className="absolute right-4 bottom-4 flex flex-col gap-1">
              {[[ZoomIn, () => zoom(1.25)], [ZoomOut, () => zoom(0.8)], [Maximize2, () => fitView(size)]].map(([I, fn], i) => (
                <button key={i} onClick={fn} className="w-8 h-8 rounded-lg border border-slate-700 bg-[#0D1729]/95 hover:border-slate-500 text-slate-400 hover:text-slate-200 flex items-center justify-center">
                  <I size={14} />
                </button>
              ))}
            </div>
          )}
          {loading && <LoadingOverlay loading={loading} />}
        </div>
        {selected && nodeById[selected] && (
          <Inspector node={nodeById[selected]} edges={graph.edges} nodeById={nodeById}
            warnings={warnings} onClose={() => setSelected(null)} onSelect={(id) => setSelected(id)} />
        )}
      </div>
    </div>
  );
}
