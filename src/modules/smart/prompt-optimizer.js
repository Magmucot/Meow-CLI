import fs from "fs";
import path from "path";
import { callApi } from "../api.js";
import { log } from "../ui.js";

/**
 * Prompt Optimizer utility.
 * Refines user prompts for better performance, lower token usage, and project alignment.
 */
export class PromptOptimizer {
  constructor(cfg) {
    this.cfg = cfg;
    this.optCfg = cfg.prompt_optimizer || { enabled: false };
  }

  /**
   * Optimizes the given prompt based on project context and configuration.
   * @param {string} prompt - The original user prompt.
   * @returns {Promise<string>} The optimized prompt.
   */
  async optimize(prompt) {
    if (!this.optCfg.enabled) return prompt;

    try {
      const context = this._getProjectContext();
      const optimizationPrompt = this._buildOptimizationPrompt(prompt, context);

      const response = await callApi([
        { role: "system", content: "You are a prompt engineering expert. Your goal is to rewrite the user's request to be more concise, technically accurate, and context-aware for the current project. Remove fluff, keep instructions clear." },
        { role: "user", content: optimizationPrompt }
      ], {
        ...this.cfg,
        model: this.optCfg.model || this.cfg.model,
        temperature: 0.1, // Low temperature for consistency
      });

      const optimized = response.choices[0].message.content.trim();
      
      if (this.optCfg.verbose) {
        log.dim(`Prompt optimized: ${prompt.length} -> ${optimized.length} chars`);
      }

      return optimized;
    } catch (e) {
      log.warn(`Prompt optimization failed: ${e.message}. Using original prompt.`);
      return prompt;
    }
  }

  /**
   * Gathers brief project context.
   * @private
   */
  _getProjectContext() {
    let context = "";
    const cwd = process.cwd();

    // Try package.json
    try {
      const pkgPath = path.join(cwd, "package.json");
      if (fs.existsSync(pkgPath)) {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
        context += `Project: ${pkg.name || "unknown"}\n`;
        if (pkg.dependencies) {
          context += `Tech Stack: ${Object.keys(pkg.dependencies).slice(0, 10).join(", ")}\n`;
        }
      }
    } catch (e) {}

    // Try MEOW.md or README.md
    try {
      const meowPath = path.join(cwd, "MEOW.md");
      const readmePath = path.join(cwd, "README.md");
      const docPath = fs.existsSync(meowPath) ? meowPath : (fs.existsSync(readmePath) ? readmePath : null);
      
      if (docPath) {
        const content = fs.readFileSync(docPath, "utf8").slice(0, 500);
        context += `Project Context: ${content}\n`;
      }
    } catch (e) {}

    return context;
  }

  /**
   * Builds the prompt for the optimization LLM.
   * @private
   */
  _buildOptimizationPrompt(prompt, context) {
    return `
Optimize the following user prompt for an AI assistant working in this project environment:

PROJECT CONTEXT:
${context}

USER PROMPT:
${prompt}

INSTRUCTIONS:
1. Shorten the prompt without losing intent.
2. Make it more specific to the project context if relevant.
3. Use professional technical language.
4. Output ONLY the optimized prompt text. No explanations.
`.trim();
  }
}
