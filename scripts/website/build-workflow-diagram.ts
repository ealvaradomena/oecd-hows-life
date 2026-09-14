/**
 * Regenerate the website workflow SVG from the authoritative TikZ source.
 * Runs through Quarto's bundled Deno runtime, so ordinary `quarto render`
 * does not require a separately installed Node.js runtime.
 */

// Quarto project scripts run from the project root. Keep the TeX and SVG paths
// project-relative so Windows tools such as MiKTeX do not receive file-URL
// pathnames like `/C:/...`, which they interpret as invalid filenames.
const source = "diagrams/project-workflow.tex";
const output = "assets/project-workflow.svg";

async function exists(path: string): Promise<boolean> {
  try {
    await Deno.stat(path);
    return true;
  } catch {
    return false;
  }
}

async function commandAvailable(command: string): Promise<boolean> {
  try {
    const result = await new Deno.Command(command, {
      args: ["--version"],
      stdout: "null",
      stderr: "null",
    }).output();
    return result.success;
  } catch {
    return false;
  }
}

if (!(await exists(source))) {
  throw new Error("Missing authoritative TikZ source: diagrams/project-workflow.tex");
}

const hasPdfLatex = await commandAvailable("pdflatex");
const hasDvisvgm = await commandAvailable("dvisvgm");

if (!hasPdfLatex || !hasDvisvgm) {
  if (!(await exists(output))) {
    throw new Error(
      "TikZ SVG is missing and pdflatex/dvisvgm are unavailable. " +
      "Install the TeX tools or restore assets/project-workflow.svg.",
    );
  }
  console.log(
    "TikZ tools unavailable; using checked-in project-workflow.svg generated from diagrams/project-workflow.tex.",
  );
  Deno.exit(0);
}

const tempDir = await Deno.makeTempDir({ prefix: "hl-tikz-" });
try {
  const pdfLatex = await new Deno.Command("pdflatex", {
    args: [
      "-interaction=nonstopmode",
      "-halt-on-error",
      "-output-directory",
      tempDir,
      source,
    ],
    stdout: "inherit",
    stderr: "inherit",
  }).output();

  if (!pdfLatex.success) {
    throw new Error("pdflatex failed for project workflow.");
  }

  const pdfPath = `${tempDir}${Deno.build.os === "windows" ? "\\" : "/"}project-workflow.pdf`;
  const dvisvgm = await new Deno.Command("dvisvgm", {
    args: ["--pdf", "--no-fonts", "--exact", "-o", output, pdfPath],
    stdout: "inherit",
    stderr: "inherit",
  }).output();

  if (!dvisvgm.success) {
    throw new Error("dvisvgm failed for project workflow.");
  }

  console.log("Regenerated assets/project-workflow.svg from diagrams/project-workflow.tex.");
} finally {
  await Deno.remove(tempDir, { recursive: true }).catch(() => undefined);
}
