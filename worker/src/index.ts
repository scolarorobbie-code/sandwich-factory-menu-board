export interface Env {
  LLM_PROVIDER_API_KEY: string;
  WORKER_SHARED_SECRET: string;
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${env.WORKER_SHARED_SECRET}`) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { "content-type": "application/json" }
      });
    }
    // Provider proxying is wired in Phase 1. Fail loudly until then.
    return new Response(
      JSON.stringify({ error: "worker proxy not implemented yet (Phase 1)" }),
      { status: 501, headers: { "content-type": "application/json" } }
    );
  }
};
