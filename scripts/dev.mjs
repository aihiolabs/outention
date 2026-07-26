import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const vite = join(projectRoot, "node_modules", "vite", "bin", "vite.js");
const children = [
  spawn(process.execPath, [vite, "build", "--watch"], { cwd: projectRoot, stdio: "inherit" }),
  spawn(process.execPath, ["--import", "tsx", "--watch", "server.ts"], { cwd: projectRoot, stdio: "inherit" })
];

let stopping = false;
function stop(signal = "SIGTERM") {
  if (stopping) return;
  stopping = true;
  for (const child of children) if (!child.killed) child.kill(signal);
}

for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => stop(signal));
for (const child of children) child.on("error", error => {
  console.error(error.message);
  stop();
  process.exitCode = 1;
});
for (const child of children) child.on("exit", code => {
  if (stopping) return;
  if (code && code !== 0) process.exitCode = code;
  stop();
});
