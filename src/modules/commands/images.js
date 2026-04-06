import fs from "fs";
import path from "path";
import {
  C,
  MUTED,
  IMG_CLR,
  USER_CLR,
  AI_CLR,
  COLS,
  log,
  Spinner,
  renderMD,
  IMAGE_EXTENSIONS,
  isImagePath,
  isUrl,
  buildVisionContent,
  callApi,
  handleTools
} from "../../core.js";

const handleImages = async (ctx, input) => {
  if (!input.startsWith("/img ")) return null;

  const rest = input.slice(5).trim();
  if (!rest) { log.err("Usage: /img <file|url> [question text]"); return { handled: true }; }
  const firstSpace = rest.indexOf(" ");
  let imgPath, imgText;
  if (firstSpace === -1) { imgPath = rest; imgText = ""; }
  else { imgPath = rest.slice(0, firstSpace); imgText = rest.slice(firstSpace + 1).trim(); }

  if (!isUrl(imgPath)) {
    const resolved = path.resolve(imgPath);
    if (!fs.existsSync(resolved)) { log.err(`File not found: ${resolved}`); return { handled: true }; }
    if (!isImagePath(imgPath)) { log.warn(`File doesn't look like an image: ${imgPath}`); log.dim(`Supported: ${[...IMAGE_EXTENSIONS].join(", ")}`); return { handled: true }; }
  }

  if (!imgText) {
    ctx.pendingImages.push(imgPath);
    log.ok(`Image queued: ${IMG_CLR}${path.basename(imgPath)}${C.reset} ${MUTED}(type your question next)${C.reset}`);
    if (ctx.pendingImages.length > 1) log.dim(`${ctx.pendingImages.length} images queued total`);
    return { handled: true };
  }

  try {
    const content = buildVisionContent(imgText, [imgPath]);
    const userMsg = { role: "user", content };
    console.log(""); console.log(`  ${USER_CLR}${C.bold}You${C.reset} ${IMG_CLR}🖼${C.reset}`);
    ctx.messages.push(userMsg);
    const spinner = new Spinner("Analyzing image"); spinner.start();
    try {
      let toolRound = 0;
      while (true) {
        const data = await callApi(ctx.messages, ctx.cfg);
        const msg = data.choices[0].message;
        const toolLoop = await handleTools(msg, ctx.messages, ctx.cfg);
        if (toolLoop) { toolRound++; spinner.update(`Processing (round ${toolRound + 1})`); continue; }
        spinner.stop();
        console.log(""); console.log(`  ${AI_CLR}${C.bold}Assistant${C.reset}`);
        console.log(`  ${MUTED}${"─".repeat(Math.min(COLS - 4, 50))}${C.reset}`);
        const output = renderMD(msg.content || "").trim();
        console.log(output.split("\n").map(l => "  " + l).join("\n"));
        console.log(`  ${MUTED}${"─".repeat(Math.min(COLS - 4, 50))}${C.reset}`);
        if (data.usage) { const u = data.usage; console.log(`  ${MUTED}tokens: ${u.prompt_tokens}→${u.completion_tokens} (${u.total_tokens} total)${C.reset}`); }
        ctx.messages.push(msg); ctx.saveState(); break;
      }
    } catch (e) { spinner.stop(); log.err(e.message); ctx.messages.pop(); }
  } catch (e) { log.err(e.message); }

  return { handled: true };
};

export { handleImages };
