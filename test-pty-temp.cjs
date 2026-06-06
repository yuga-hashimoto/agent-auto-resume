const { spawn } = require("child_process");
const pty = require("node-pty");

try {
  console.log("Attempting to spawn standard child_process...");
  const child = spawn("/bin/bash", ["-c", "echo 'Standard Success'"], {
    cwd: "/tmp",
    env: process.env
  });
  child.stdout.on("data", (data) => console.log(`Standard Output: ${data.trim()}`));
  child.on("exit", (code) => console.log(`Standard Exit Code: ${code}`));
  child.on("error", (err) => console.error(`Standard Error: ${err.message}`));
} catch (err) {
  console.error(`Standard spawn throw: ${err.message}`);
}

try {
  console.log("Attempting to spawn pty...");
  const p = pty.spawn("/bin/bash", ["-c", "echo 'PTY Success'"], {
    cwd: "/tmp",
    env: process.env
  });
  p.onData((data) => console.log(`PTY Output: ${data.trim()}`));
  p.onExit((res) => console.log(`PTY Exit Code: ${res.exitCode}`));
} catch (err) {
  console.error(`PTY spawn throw: ${err.message}`);
}
