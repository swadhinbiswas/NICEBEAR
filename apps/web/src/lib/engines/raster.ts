/**
 * SVG → PNG rasterization via resvg (lazy-loaded so the edge bundle stays
 * lean and runtimes without the native build degrade to a clean 503).
 * Node/self-host: full PNG support. Cloudflare Workers: resvg's napi build
 * cannot load — PNG there returns 503 until the wasm backend lands.
 */

export class RenderUnavailable extends Error {
  constructor() {
    super("PNG rendering is unavailable on this runtime");
  }
}

type ResvgCtor = new (
  svg: string | Uint8Array,
  options?: { fitTo?: { mode: string; value: number } },
) => { render(): { asPng(): Uint8Array } };

let ctorPromise: Promise<ResvgCtor> | null = null;

async function loadResvg(): Promise<ResvgCtor> {
  if (!ctorPromise) {
    ctorPromise = import("@resvg/resvg-js").then(
      (m) => (m as unknown as { Resvg: ResvgCtor }).Resvg,
      () => {
        throw new RenderUnavailable();
      },
    );
  }
  return ctorPromise;
}

export async function svgToPng(svg: string, width: number): Promise<Uint8Array> {
  const w = Math.max(16, Math.min(1024, Math.floor(width) || 256));
  const Resvg = await loadResvg();
  const resvg = new Resvg(svg, { fitTo: { mode: "width", value: w } });
  return resvg.render().asPng();
}
