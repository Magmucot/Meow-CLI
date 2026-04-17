import { 
  callApi, callApiStream, handleTools, log, Spinner 
} from "../core.js";
import { StreamRenderer, renderNonStreaming } from "./ui-render.js";

/**
 * Handles the interaction with the AI, including streaming, tool calls, and retries.
 * @param {Object} ctx - CLI Context
 * @param {Object} effectiveCfg - Configuration to use (possibly with routed model)
 * @param {Object} options - { useStreaming, checkpointMgr, costTracker, allImages }
 */
export async function runAiInteraction(ctx, effectiveCfg, { useStreaming, checkpointMgr, costTracker, allImages }) {
  const spinnerText = allImages.length > 0 ? "Analyzing image" : "Thinking";
  const spinner = new Spinner(spinnerText);
  
  try {
    let toolRound = 0;
    while (true) {
      let data;
      if (useStreaming && toolRound === 0) {
        const renderer = new StreamRenderer();
        spinner.start();
        data = await callApiStream(ctx.messages, effectiveCfg, (chunk) => {
          if (chunk.type === "text" && chunk.content) { 
            spinner.stop(); 
            renderer.onChunk(chunk); 
          }
        });
        spinner.stop();
        const msg = data.choices[0].message;
        
        if (msg.tool_calls && msg.tool_calls.length > 0) {
          renderer.finish();
          const toolLoop = await handleTools(msg, ctx.messages, ctx.cfg, checkpointMgr);
          if (toolLoop) { 
            toolRound++; 
            spinner.update(`Processing (round ${toolRound + 1})`); 
            continue; 
          }
        }
        
        renderer.finish();
        if (data.usage) {
          costTracker.record(data.usage, effectiveCfg.model);
          const costStr = costTracker.formatInline(data.usage, effectiveCfg.model);
          log.dim(costStr);
        }
        ctx.messages.push(msg);
        break;
      } else {
        if (!spinner.timer) spinner.start();
        data = await callApi(ctx.messages, effectiveCfg);
        const msg = data.choices[0].message;
        const toolLoop = await handleTools(msg, ctx.messages, ctx.cfg, checkpointMgr);
        
        if (toolLoop) { 
          toolRound++; 
          spinner.update(`Processing (round ${toolRound + 1})`); 
          continue; 
        }
        
        spinner.stop();
        renderNonStreaming(msg);
        
        if (data.usage) {
          costTracker.record(data.usage, effectiveCfg.model);
          const costStr = costTracker.formatInline(data.usage, effectiveCfg.model);
          log.dim(costStr);
        }
        ctx.messages.push(msg);
        break;
      }
    }
    ctx.saveState();
    ctx.sessionMgr.save({ 
      model: ctx.cfg.model, 
      profile: ctx.cfg.profile, 
      chat: ctx.currentChat, 
      messages: ctx.messages 
    });
  } catch (e) { 
    spinner.stop(); 
    log.err(e.message); 
    ctx.messages.pop(); 
  }
}
