import fs from "fs-extra";
import path from "path";
import os from "os";
import { execSync } from "child_process";

// aarの絶対パスを取得する
function getAarPath(): string {
  try {
    const whichAar = execSync("which aar", { encoding: "utf8" }).trim();
    if (whichAar) return whichAar;
  } catch {
    // ignore
  }
  const home = os.homedir();
  const possiblePaths = [
    path.join(home, ".hermes/node/bin/aar"),
    path.join(home, ".npm-global/bin/aar"),
    "/usr/local/bin/aar",
    "/opt/homebrew/bin/aar",
  ];
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) return p;
  }
  return "aar";
}

// macOS用のLaunchAgentのplist内容を生成
function generatePlistContent(aarPath: string): string {
  const logDir = path.join(os.homedir(), ".agent-auto-resume");
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.user.agent-auto-resume</string>
    <key>ProgramArguments</key>
    <array>
        <string>${aarPath}</string>
        <string>daemon</string>
        <string>start</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <false/>
    <key>StandardOutPath</key>
    <string>${path.join(logDir, "daemon-launchd.log")}</string>
    <key>StandardErrorPath</key>
    <string>${path.join(logDir, "daemon-launchd.err")}</string>
</dict>
</plist>
`;
}

// Linux用のSystemdサービスの構成内容を生成
function generateServiceContent(aarPath: string): string {
  return `[Unit]
Description=Agent Auto Resume Daemon
After=network.target

[Service]
Type=simple
ExecStart=${aarPath} daemon run
Restart=on-failure

[Install]
WantedBy=default.target
`;
}

/**
 * ログイン時の自動起動を有効化する。
 */
export async function setupAutostart(): Promise<string> {
  const platform = os.platform();
  const aarPath = getAarPath();

  if (platform === "darwin") {
    const plistDir = path.join(os.homedir(), "Library/LaunchAgents");
    const plistPath = path.join(plistDir, "com.user.agent-auto-resume.plist");

    await fs.ensureDir(plistDir);
    const content = generatePlistContent(aarPath);

    // 重複エラーを避けるためにアンロード
    try {
      execSync(`launchctl unload ${plistPath}`, { stdio: "ignore" });
    } catch {
      // ignore
    }

    await fs.writeFile(plistPath, content, "utf-8");
    execSync(`launchctl load ${plistPath}`);

    return "Successfully configured and loaded LaunchAgent for macOS. aar daemon will autostart on login.";
  } else if (platform === "linux") {
    const serviceDir = path.join(os.homedir(), ".config/systemd/user");
    const servicePath = path.join(serviceDir, "aar.service");

    await fs.ensureDir(serviceDir);
    const content = generateServiceContent(aarPath);

    await fs.writeFile(servicePath, content, "utf-8");

    execSync("systemctl --user daemon-reload");
    execSync("systemctl --user enable aar");
    execSync("systemctl --user start aar");

    return "Successfully configured and enabled Systemd user service for Linux. aar daemon will autostart on login.";
  } else {
    throw new Error(`Autostart is not supported on platform: ${platform}`);
  }
}

/**
 * ログイン時の自動起動を無効化する。
 */
export async function removeAutostart(): Promise<string> {
  const platform = os.platform();

  if (platform === "darwin") {
    const plistPath = path.join(os.homedir(), "Library/LaunchAgents/com.user.agent-auto-resume.plist");

    if (fs.existsSync(plistPath)) {
      try {
        execSync(`launchctl unload ${plistPath}`, { stdio: "ignore" });
      } catch {
        // ignore
      }
      await fs.remove(plistPath);
      return "Removed LaunchAgent plist for macOS. Autostart disabled.";
    }
    return "Autostart settings not found. Nothing to remove.";
  } else if (platform === "linux") {
    const servicePath = path.join(os.homedir(), ".config/systemd/user/aar.service");

    if (fs.existsSync(servicePath)) {
      try {
        execSync("systemctl --user stop aar", { stdio: "ignore" });
        execSync("systemctl --user disable aar", { stdio: "ignore" });
      } catch {
        // ignore
      }
      await fs.remove(servicePath);
      return "Removed Systemd service for Linux. Autostart disabled.";
    }
    return "Autostart settings not found. Nothing to remove.";
  } else {
    throw new Error(`Autostart is not supported on platform: ${platform}`);
  }
}
