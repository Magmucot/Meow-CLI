import { text, isCancel, cancel, note } from "@clack/prompts";
import { MUTED, ACCENT, C } from "./ui.js";

const askInput = async (message) => {
  const input = await text({
    message: message,
    placeholder: "Type a message or /help...",
    validate(value) {
      // Optional validation
    },
  });

  if (isCancel(input)) {
    console.log(`\n  ${MUTED("Goodbye! 👋")}\n`);
    process.exit(0);
  }

  return input;
};

// Keeping these for compatibility if needed, but they are now simplified
const buildMultilinePrompt = (promptText) => promptText;
const readMultilineInput = (promptText) => askInput(promptText);

export { buildMultilinePrompt, readMultilineInput, askInput };
