
import { handleGeneral } from "./general.js";
import { handleAssistant } from "./assistant.js";
import { handlePins } from "./pins.js";
import { handleVacuum } from "./vacuum.js";
import { handleAutopilot } from "./autopilot.js";
import { handleChat } from "./chat.js";
import { handleSettings } from "./settings.js";
import { handleTools } from "./tools.js";
import { handleImages } from "./images.js";
import { handleMisc } from "./misc.js";
import { handlePlugins } from "./plugins.js";
import { handlePermissions } from "./permissions.js";
import { handleContext } from "./context.js";
import { handleRewind } from "./rewind.js";
import { handleSessions } from "./sessions.js";
import { handleCost } from "./cost.js";
import { handleCompact } from "./compact.js";

const commandHandlers = [
  handleGeneral,
  handleAssistant,
  handlePins,
  handleVacuum,
  handleAutopilot,
  handleChat,
  handleSettings,
  handleTools,
  handleImages,
  handlePlugins,
  handlePermissions,
  handleContext,
  handleRewind,
  handleSessions,
  handleCost,
  handleCompact,
  handleMisc,
];

const runCommandHandlers = async (ctx, input) => {
  let currentInput = input;
  for (const handler of commandHandlers) {
    const result = await handler(ctx, currentInput);
    if (!result) continue;
    if (result.input !== undefined) currentInput = result.input;
    if (result.exit) return { handled: true, exit: true, input: currentInput };
    if (result.handled && result.continue) return { handled: true, continue: true, input: currentInput };
    if (result.handled) return { handled: true, input: currentInput };
  }
  return { handled: false, input: currentInput };
};

export { runCommandHandlers };
