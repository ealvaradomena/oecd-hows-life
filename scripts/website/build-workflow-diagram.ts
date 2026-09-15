/** Regenerate the committed workflow SVG only when its content fingerprint changes. */
const source = "diagrams/project-workflow.tex";
const output = "assets/project-workflow.svg";
const fingerprintFile = "assets/project-workflow.sha256";
const generatorInputs = [source, "scripts/website/build-workflow-diagram.mjs", "scripts/website/build-workflow-diagram.ts"];

async function exists(file: string): Promise<boolean> {
  try { await Deno.stat(file); return true; } catch { return false; }
}

async function fingerprint(): Promise<string> {
  const chunks: Uint8Array[] = [];
  const encoder = new TextEncoder();
  for (const relative of generatorInputs) {
    if (!(await exists(relative))) throw new Error(`Missing workflow-diagram input: ${relative}`);
    chunks.push(encoder.encode(`${relative}\0`), await Deno.readFile(relative), encoder.encode("\0"));
  }
  const bytes = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.length, 0));
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

async function commandAvailable(command: string): Promise<boolean> {
  try { return (await new Deno.Command(command, { args: ["--version"], stdout: "null", stderr: "null" }).output()).success; }
  catch { return false; }
}

const current = await fingerprint();
const recorded = (await exists(fingerprintFile)) ? (await Deno.readTextFile(fingerprintFile)).trim() : "";
if ((await exists(output)) && recorded === current) {
  console.log("Workflow diagram is current; skipped regeneration.");
  Deno.exit(0);
}
if (!(await commandAvailable("pdflatex")) || !(await commandAvailable("dvisvgm"))) {
  throw new Error("Workflow diagram is stale or missing, and pdflatex/dvisvgm are unavailable. Install the TeX tools, regenerate assets/project-workflow.svg, and commit it with assets/project-workflow.sha256.");
}
const tempDir = await Deno.makeTempDir({ prefix: "hl-tikz-" });
try {
  const latex = await new Deno.Command("pdflatex", { args: ["-interaction=nonstopmode", "-halt-on-error", "-output-directory", tempDir, source], stdout: "inherit", stderr: "inherit" }).output();
  if (!latex.success) throw new Error("pdflatex failed for project workflow.");
  const separator = Deno.build.os === "windows" ? "\\" : "/";
  const generated = `${tempDir}${separator}project-workflow.svg`;
  const converted = await new Deno.Command("dvisvgm", { args: ["--pdf", "--no-fonts", "--exact", "-o", generated, `${tempDir}${separator}project-workflow.pdf`], stdout: "inherit", stderr: "inherit" }).output();
  if (!converted.success) throw new Error("dvisvgm failed for project workflow.");
  if (!(await exists(generated))) throw new Error("dvisvgm did not produce project-workflow.svg.");
  await Deno.copyFile(generated, output);
  await Deno.writeTextFile(fingerprintFile, `${current}\n`);
  console.log("Regenerated assets/project-workflow.svg from diagrams/project-workflow.tex.");
} finally { await Deno.remove(tempDir, { recursive: true }).catch(() => undefined); }
