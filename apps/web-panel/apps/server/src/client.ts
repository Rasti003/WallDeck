import type { FastifyInstance } from "fastify";
import fastifyStatic from "@fastify/static";

export async function registerClient(app: FastifyInstance, root: string) {
  // Resolve files per request: Vite changes asset names on each build.
  await app.register(fastifyStatic, {
    root,
    wildcard: true,
    cacheControl: false,
    setHeaders(response, filePath) {
      if (filePath.endsWith(".html")) response.setHeader("Cache-Control", "no-store, max-age=0");
    },
  });
  app.setNotFoundHandler((request, reply) => {
    const pathname = new URL(request.url, "http://localhost").pathname;
    const isPage = ["/", "/panel", "/admin", "/ha", "/music", "/timers", "/assistant-demo", "/assistant-expressive", "/assistant-canvas"].some(
      route => pathname === route || (route !== "/" && pathname.startsWith(`${route}/`)),
    );
    if ((request.method === "GET" || request.method === "HEAD") && isPage) {
      return reply.header("Cache-Control", "no-store, max-age=0").sendFile("index.html");
    }
    return reply.code(404).send({ error: "Nie znaleziono zasobu" });
  });
}
