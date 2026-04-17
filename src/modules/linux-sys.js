import { execSync } from "child_process";
import { confirmUser } from "./tools.js";
import { TEXT_DIM, C } from "./ui.js";

/**
 * Linux System Management Tools (Beta)
 */

/**
 * Lists running processes.
 * @returns {string} Process list output.
 */
export function linuxProcessList() {
  try {
    return execSync("ps aux --sort=-%cpu | head -n 20", { encoding: "utf8" });
  } catch (e) {
    return `❌ Error listing processes: ${e.message}`;
  }
}

/**
 * Kills a process by PID.
 * @param {Object} args - { pid, signal }
 * @param {Object} cfg - Configuration.
 * @returns {Promise<string>} Result message.
 */
export async function linuxProcessKill({ pid, signal = "SIGTERM" }, cfg = {}) {
  try {
    const approved = await confirmUser(
      `Kill process ${pid} with ${signal}?`,
      cfg.auto_yes,
      false
    );
    if (!approved) return "ℹ Operation cancelled.";

    execSync(`kill -s ${signal} ${pid}`);
    return `✅ Process ${pid} killed with ${signal}.`;
  } catch (e) {
    return `❌ Error killing process: ${e.message}`;
  }
}

/**
 * Manages systemd services.
 * @param {Object} args - { service, action }
 * @param {Object} cfg - Configuration.
 * @returns {Promise<string>} Result message.
 */
export async function linuxServiceControl({ service, action }, cfg = {}) {
  const validActions = ["start", "stop", "restart", "status", "enable", "disable"];
  if (!validActions.includes(action)) return `❌ Invalid action: ${action}`;

  try {
    if (action !== "status") {
      const approved = await confirmUser(
        `Execute 'systemctl ${action} ${service}'?`,
        cfg.auto_yes,
        false
      );
      if (!approved) return "ℹ Operation cancelled.";
    }

    const output = execSync(`systemctl ${action} ${service}`, { encoding: "utf8" });
    return output || `✅ Service ${service} ${action}ed successfully.`;
  } catch (e) {
    return `❌ Error controlling service: ${e.message}`;
  }
}

/**
 * Checks disk usage.
 * @returns {string} Disk usage output.
 */
export function linuxDiskUsage() {
  try {
    return execSync("df -h", { encoding: "utf8" });
  } catch (e) {
    return `❌ Error checking disk usage: ${e.message}`;
  }
}

/**
 * Checks network status/ports.
 * @returns {string} Network status output.
 */
export function linuxNetStat() {
  try {
    // Prefer 'ss' over 'netstat' as it's more modern
    return execSync("ss -tulpn", { encoding: "utf8" });
  } catch (e) {
    try {
      return execSync("netstat -tulpn", { encoding: "utf8" });
    } catch (e2) {
      return `❌ Error checking network status: ${e.message}`;
    }
  }
}

/**
 * Detects and runs package manager commands.
 * @param {Object} args - { action, package: pkg }
 * @param {Object} cfg - Configuration.
 * @returns {Promise<string>} Result message.
 */
export async function linuxPkgManage({ action, package: pkg }, cfg = {}) {
  const managers = [
    { cmd: "apt-get", install: "install -y", update: "update" },
    { cmd: "dnf", install: "install -y", update: "check-update" },
    { cmd: "yum", install: "install -y", update: "check-update" },
    { cmd: "pacman", install: "-S --noconfirm", update: "-Sy" }
  ];

  let manager = null;
  for (const m of managers) {
    try {
      execSync(`which ${m.cmd}`, { stdio: "ignore" });
      manager = m;
      break;
    } catch { continue; }
  }

  if (!manager) return "❌ No supported package manager found (apt, dnf, yum, pacman).";

  try {
    let fullCmd = "";
    if (action === "install") fullCmd = `${manager.cmd} ${manager.install} ${pkg}`;
    else if (action === "update") fullCmd = `${manager.cmd} ${manager.update}`;
    else return `❌ Unsupported action: ${action}`;

    const approved = await confirmUser(
      `Run package manager: '${fullCmd}'?`,
      cfg.auto_yes,
      false
    );
    if (!approved) return "ℹ Operation cancelled.";

    const output = execSync(fullCmd, { encoding: "utf8" });
    return output || `✅ Package operation completed.`;
  } catch (e) {
    return `❌ Package management error: ${e.message}`;
  }
}
