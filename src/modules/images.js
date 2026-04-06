import fs from "fs";
import path from "path";
import { formatBytes } from "./utils.js";
import { log } from "./ui.js";

// ─── Image Helpers ──────────────────────────────────────────────────────────

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".svg"]);
const MIME_TYPES = {
  ".png":"image/png", ".jpg":"image/jpeg", ".jpeg":"image/jpeg",
  ".gif":"image/gif", ".webp":"image/webp", ".bmp":"image/bmp", ".svg":"image/svg+xml",
};

function isImagePath(p) { return IMAGE_EXTENSIONS.has(path.extname(p).toLowerCase()); }
function isUrl(s) { return /^https?:\/\//i.test(s); }
function isValidImageUrl(s) {
  if (typeof s !== "string") return false;
  if (s.startsWith("data:")) return true;
  return isUrl(s);
}

function encodeImageFile(filePath) {
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) throw new Error(`File not found: ${resolved}`);
  const stat = fs.statSync(resolved);
  if (!stat.isFile()) throw new Error(`Not a file: ${resolved}`);
  if (stat.size > 20 * 1024 * 1024) throw new Error(`Image too large (${formatBytes(stat.size)}, max 20MB)`);
  const ext = path.extname(resolved).toLowerCase();
  const mime = MIME_TYPES[ext] || "image/png";
  const buf = fs.readFileSync(resolved);
  return { url: `data:${mime};base64,${buf.toString("base64")}`, size: formatBytes(stat.size) };
}

function buildVisionContent(text, images) {
  const content = [];
  for (const img of images) {
    if (isUrl(img)) {
      content.push({ type: "image_url", image_url: { url: img, detail: "auto" } });
      log.img(img, "URL");
    } else {
      const encoded = encodeImageFile(img);
      content.push({ type: "image_url", image_url: { url: encoded.url, detail: "auto" } });
      log.img(img, encoded.size);
    }
  }
  content.push({ type: "text", text: text.trim() || "Что на этом изображении?" });
  return content;
}

function parseInlineImages(input) {
  const images = [];
  const text = input.replace(/\{img:([^}]+)\}/g, (_, p) => { images.push(p.trim()); return ""; });
  return { text: text.trim(), images };
}

function simplifyContentForHistory(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return content;
  return content.map(part => {
    if (part.type === "image_url" && part.image_url?.url?.startsWith("data:"))
      return { type: "image_url", image_url: { url: "[base64 image]", detail: part.image_url.detail } };
    return part;
  });
}

function sanitizeVisionContent(content) {
  if (!Array.isArray(content)) return content;
  let dropped = false;
  const cleaned = content.filter(part => {
    if (part?.type !== "image_url") return true;
    const url = part?.image_url?.url;
    const ok = isValidImageUrl(url);
    if (!ok) dropped = true;
    return ok;
  });
  if (dropped && !cleaned.some(part => part?.type === "text")) {
    cleaned.push({ type: "text", text: "[image omitted]" });
  }
  return cleaned;
}

function sanitizeMessagesForApi(messages) {
  const cleaned = [];
  let toolBuffer = null;

  const flushToolBuffer = (complete) => {
    if (toolBuffer && complete) {
      cleaned.push(toolBuffer.assistant, ...toolBuffer.outputs);
    }
    toolBuffer = null;
  };

  for (const msg of messages) {
    if (toolBuffer) {
      if (msg?.role === "tool") {
        if (toolBuffer.pendingIds.has(msg.tool_call_id)) {
          toolBuffer.outputs.push(msg);
          toolBuffer.pendingIds.delete(msg.tool_call_id);
          if (toolBuffer.pendingIds.size === 0) flushToolBuffer(true);
        }
        continue;
      }
      flushToolBuffer(false);
    }

    if (msg?.role === "assistant" && Array.isArray(msg.tool_calls) && msg.tool_calls.length > 0) {
      const ids = msg.tool_calls.map(call => call.id);
      toolBuffer = { assistant: msg, pendingIds: new Set(ids), outputs: [] };
      continue;
    }

    if (Array.isArray(msg?.content)) {
      const sanitized = sanitizeVisionContent(msg.content);
      cleaned.push(sanitized === msg.content ? msg : { ...msg, content: sanitized });
    } else {
      cleaned.push(msg);
    }
  }

  return cleaned;
}


function sanitizeToolCallsForApi(messages) {
  const toolCallIds = new Set();
  const toolResponseIds = new Set();
  for (const msg of messages) {
    if (msg?.tool_calls) {
      for (const call of msg.tool_calls) {
        if (call?.id) toolCallIds.add(call.id);
      }
    }
    if (msg?.role === "tool" && msg?.tool_call_id) {
      toolResponseIds.add(msg.tool_call_id);
    }
  }
  const missing = new Set();
  for (const id of toolCallIds) {
    if (!toolResponseIds.has(id)) missing.add(id);
  }
  if (missing.size === 0) return messages;
  return messages.map(msg => {
    if (!msg?.tool_calls) return msg;
    const filtered = msg.tool_calls.filter(call => !missing.has(call?.id));
    if (filtered.length === msg.tool_calls.length) return msg;
    const rest = { ...msg, tool_calls: filtered };
    return rest;
  });
}


export { IMAGE_EXTENSIONS, MIME_TYPES, isImagePath, isUrl, isValidImageUrl, encodeImageFile, buildVisionContent, parseInlineImages, simplifyContentForHistory, sanitizeVisionContent, sanitizeMessagesForApi, sanitizeToolCallsForApi };
