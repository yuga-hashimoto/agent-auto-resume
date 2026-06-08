import path from "path";
import fs from "fs-extra";
import chalk from "chalk";
import { getBaseDir, ensureDirs } from "./session-store.js";

export const getLogFile = () => path.join(getBaseDir(), "daemon.log");

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

let currentLogLevel = LogLevel.INFO;
let isConsoleMuted = false;

export function setLogLevel(level: LogLevel) {
  currentLogLevel = level;
}

export function setMuteConsole(mute: boolean) {
  isConsoleMuted = mute;
}

async function writeToFile(message: string) {
  try {
    await ensureDirs();
    const ts = new Date().toISOString();
    // 制御文字 (chalkのカラーコードなど) を削除してログファイルに保存
    const cleanMsg = message.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, "");
    await fs.appendFile(getLogFile(), `[${ts}] ${cleanMsg}\n`, "utf-8");
  } catch {
    // ログ書き込み失敗は静かに無視
  }
}

function formatMessage(prefix: string, message: string, colorFn?: (s: string) => string): string {
  const cleanPrefix = prefix ? `[${prefix}] ` : "";
  const formatted = `${cleanPrefix}${message}`;
  return colorFn ? colorFn(formatted) : formatted;
}

export const logger = {
  debug(message: string, prefix = "aar") {
    if (currentLogLevel <= LogLevel.DEBUG) {
      const msg = formatMessage(prefix, message, chalk.gray);
      if (!isConsoleMuted) console.log(msg);
      writeToFile(msg);
    }
  },

  info(message: string, prefix = "aar") {
    if (currentLogLevel <= LogLevel.INFO) {
      const msg = formatMessage(prefix, message, chalk.blue);
      if (!isConsoleMuted) console.log(msg);
      writeToFile(msg);
    }
  },

  warn(message: string, prefix = "aar") {
    if (currentLogLevel <= LogLevel.WARN) {
      const msg = formatMessage(prefix, message, chalk.yellow);
      if (!isConsoleMuted) console.warn(msg);
      writeToFile(msg);
    }
  },

  error(message: string, prefix = "aar") {
    if (currentLogLevel <= LogLevel.ERROR) {
      const msg = formatMessage(prefix, message, chalk.red);
      if (!isConsoleMuted) console.error(msg);
      writeToFile(msg);
    }
  },
};
