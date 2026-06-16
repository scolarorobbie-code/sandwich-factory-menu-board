// Wrangler/esbuild bundles `*.html` as a Text module (see wrangler.toml
// [[rules]] type = "Text"). This lets the Worker `import` the control-panel
// markup as a string and serve it inline from `GET /admin`.
declare module "*.html" {
  const content: string;
  export default content;
}
