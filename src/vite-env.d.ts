/// <reference types="vite/client" />

// Static asset imports (handled by Vite / the figma-asset-resolver plugin)
declare module "*.png" {
  const src: string;
  export default src;
}

declare module "*.jpg" {
  const src: string;
  export default src;
}

declare module "*.jpeg" {
  const src: string;
  export default src;
}

declare module "*.svg" {
  const src: string;
  export default src;
}

declare module "*.csv" {
  const content: string;
  export default content;
}

// Figma Make asset alias, e.g. import x from "figma:asset/abc.png"
declare module "figma:asset/*" {
  const src: string;
  export default src;
}

// Environment variables the dashboard reads. VITE_API_URL points at the Go
// backend; it defaults to http://localhost:8080/api/v1 when unset.
interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
