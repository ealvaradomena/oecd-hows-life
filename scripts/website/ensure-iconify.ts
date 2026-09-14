/**
 * Legacy one-time Iconify installer retained for provenance.
 *
 * This script is not referenced by the current `_quarto.yml` pre-render hooks
 * or by the strict Node builder. The project now versions the extension under
 * `_extensions/mcanouil/iconify/`, and `scripts/website/build.mjs` only verifies
 * that the local extension is present.
 *
 * The installer logic below reflects an earlier setup path and should not be
 * treated as the authoritative extension-version policy for current renders.
 */

const extensionFile = new URL("../../_extensions/mcanouil/iconify/_extension.yml", import.meta.url);
let installed = false;
try {
  await Deno.stat(extensionFile);
  installed = true;
} catch {
  installed = false;
}

if (!installed) {
  console.log("Installing pinned Quarto Iconify extension (4.2.1)...");
  const command = new Deno.Command("quarto", {
    args: ["add", "mcanouil/quarto-iconify@4.2.1", "--no-prompt"],
    stdin: "null",
    stdout: "inherit",
    stderr: "inherit",
  });
  const child = command.spawn();
  const result = await child.status;
  if (!result.success) {
    throw new Error(`Unable to install Quarto Iconify extension (exit ${result.code}).`);
  }
}
