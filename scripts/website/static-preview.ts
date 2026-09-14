/**
 * Static website preview server for the already-rendered docs/ tree.
 *
 * Why this exists:
 * - Quarto's built-in website preview server can incrementally render a target
 *   page when it is requested.
 * - Incremental renders execute code even when execute.freeze is enabled,
 *   unless the CLI is explicitly started with --use-freezer.
 * - This project is maintained as a frozen analytical presentation, so navbar
 *   navigation should never be a trigger for R execution.
 *
 * This server is launched by project.preview.serve in _quarto.yml through
 * `quarto run`, so it uses Quarto's bundled Deno runtime and adds no Node or
 * Python dependency.
 */

export {};

function option(name: string, fallback?: string): string {
  const index = Deno.args.indexOf(name);
  if (index >= 0 && index + 1 < Deno.args.length) return Deno.args[index + 1];
  if (fallback !== undefined) return fallback;
  throw new Error(`Missing required option: ${name}`);
}

const rootArgument = option("--root", "docs");
const host = option("--host", "127.0.0.1");
const portText = option("--port", "4200");
const port = Number.parseInt(portText, 10);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error(`Invalid --port value: ${portText}`);
}

const root = await Deno.realPath(rootArgument);
const rootPrefix = root.endsWith("/") || root.endsWith("\\")
  ? root
  : `${root}${Deno.build.os === "windows" ? "\\" : "/"}`;

const mimeTypes: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

function extension(path: string): string {
  const name = path.replaceAll("\\", "/").split("/").pop() ?? "";
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot).toLowerCase() : "";
}

function response(status: number, body: string): Response {
  return new Response(body, {
    status,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

async function resolveRequestPath(pathname: string): Promise<string | null> {
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }

  if (decoded.includes("\0")) return null;
  const segments = decoded.replaceAll("\\", "/").split("/").filter(Boolean);
  if (segments.some((part) => part === ".." || part === ".")) return null;

  let relative = segments.join("/");
  if (!relative || decoded.endsWith("/")) relative = `${relative ? `${relative}/` : ""}index.html`;

  const separator = Deno.build.os === "windows" ? "\\" : "/";
  let candidate = `${rootPrefix}${relative.replaceAll("/", separator)}`;

  try {
    const info = await Deno.stat(candidate);
    if (info.isDirectory) candidate = `${candidate}${separator}index.html`;
  } catch {
    if (!extension(candidate)) {
      const htmlCandidate = `${candidate}.html`;
      try {
        const info = await Deno.stat(htmlCandidate);
        if (info.isFile) candidate = htmlCandidate;
      } catch {
        return null;
      }
    } else {
      return null;
    }
  }

  let real: string;
  try {
    real = await Deno.realPath(candidate);
  } catch {
    return null;
  }

  const insideRoot = real === root ||
    (Deno.build.os === "windows"
      ? real.toLowerCase().startsWith(rootPrefix.toLowerCase())
      : real.startsWith(rootPrefix));
  return insideRoot ? real : null;
}

const server = Deno.serve({
  hostname: host,
  port,
  onListen({ hostname, port }) {
    const displayHost = hostname === "0.0.0.0" ? "127.0.0.1" : hostname;
    console.log(`STATIC_PREVIEW_READY http://${displayHost}:${port}/`);
  },
}, async (request) => {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return response(405, "Method not allowed");
  }

  const url = new URL(request.url);
  const file = await resolveRequestPath(url.pathname);
  if (!file) return response(404, "Not found");

  let bytes: Uint8Array;
  try {
    bytes = await Deno.readFile(file);
  } catch {
    return response(404, "Not found");
  }

  const headers = new Headers({
    "content-type": mimeTypes[extension(file)] ?? "application/octet-stream",
    "content-length": String(bytes.byteLength),
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });

  return new Response(request.method === "HEAD" ? null : bytes, {
    status: 200,
    headers,
  });
});

await server.finished;
