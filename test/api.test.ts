import { describe, expect, it, afterEach } from "vitest";
import { createApp } from "../src/app.js";

function build() {
  return createApp({ config: { baseUrl: "http://test.local" } });
}

describe("paste API", () => {
  let app = build();
  afterEach(async () => {
    await app.close();
    app = build();
  });

  it("creates and fetches a paste via json", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/paste",
      payload: { content: "console.log(1)", language: "js" },
    });
    expect(created.statusCode).toBe(201);
    const meta = created.json();
    expect(meta.url).toMatch(/^http:\/\/test\.local\/[0-9a-zA-Z]{8}$/);

    const raw = await app.inject({ url: `/${meta.id}/raw` });
    expect(raw.statusCode).toBe(200);
    expect(raw.body).toBe("console.log(1)");
    expect(raw.headers["x-content-hash"]).toHaveLength(64);
  });

  it("renders an html view with escaped content", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/paste",
      payload: { content: "<script>alert('xss')</script>" },
    });
    const { id } = created.json();

    const view = await app.inject({ url: `/${id}`, headers: { accept: "text/html" } });
    expect(view.statusCode).toBe(200);
    expect(view.headers["content-type"]).toContain("text/html");
    expect(view.body).not.toContain("<script>alert");
    expect(view.body).toContain("&lt;script&gt;");
  });

  it("returns json when the client asks for it", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/paste",
      payload: { content: "data" },
    });
    const { id } = created.json();
    const res = await app.inject({
      url: `/${id}`,
      headers: { accept: "application/json" },
    });
    expect(res.json().content).toBe("data");
  });

  it("accepts form posts from the web page", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/paste",
      payload: "content=from+the+form&language=text",
      headers: { "content-type": "application/x-www-form-urlencoded" },
    });
    expect(created.statusCode).toBe(201);
    const { id } = created.json();
    const raw = await app.inject({ url: `/${id}/raw` });
    expect(raw.body).toBe("from the form");
  });

  it("accepts raw text bodies", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/paste",
      payload: "just some text",
      headers: { "content-type": "text/plain" },
    });
    expect(created.statusCode).toBe(201);
    const { id } = created.json();
    const raw = await app.inject({ url: `/${id}/raw` });
    expect(raw.body).toBe("just some text");
  });

  it("expires pastes with ttl=3600", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/paste",
      payload: { content: "gone soon", ttl: 3600 },
    });
    expect(created.json().expiresAt).not.toBeNull();
  });

  it("rejects invalid ttl values", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/paste",
      payload: { content: "x", ttl: 12345 },
    });
    expect(res.statusCode).toBe(400);
  });

  it("burn-after-read works over http", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/paste",
      payload: { content: "one shot", burnAfterRead: true },
    });
    const { id } = created.json();

    const first = await app.inject({ url: `/${id}/raw` });
    expect(first.statusCode).toBe(200);
    expect(first.body).toBe("one shot");

    const second = await app.inject({ url: `/${id}/raw` });
    expect(second.statusCode).toBe(404);
  });

  it("returns 404 for unknown pastes", async () => {
    const raw = await app.inject({ url: "/zzzzzzzz/raw" });
    expect(raw.statusCode).toBe(404);
  });

  it("rejects empty content with 400", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/paste",
      payload: { content: "" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("rejects oversized content with 413", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/paste",
      payload: { content: "x".repeat(200_000) },
    });
    expect(res.statusCode).toBe(413);
  });

  it("serves the home page", async () => {
    const res = await app.inject({ url: "/" });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain("<form");
  });

  it("reports health", async () => {
    const res = await app.inject({ url: "/health" });
    expect(res.json().status).toBe("ok");
  });
});

describe("GET /stats and /recent", () => {
  it("aggregates stats", async () => {
    const app2 = build();
    await app2.inject({
      method: "POST",
      url: "/paste",
      payload: { content: "one", burnAfterRead: false },
    });
    await app2.inject({
      method: "POST",
      url: "/paste",
      payload: { content: "two with more bytes", ttl: 3600 },
    });
    const res = await app2.inject({ url: "/stats" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.totalPastes).toBe(2);
    expect(body.totalBytes).toBeGreaterThan(0);
    expect(body.withTtl).toBe(1);
    await app2.close();
  });

  it("lists recent pastes newest first", async () => {
    const app2 = build();
    await app2.inject({ method: "POST", url: "/paste", payload: { content: "first" } });
    await app2.inject({ method: "POST", url: "/paste", payload: { content: "second", language: "go" } });
    const res = await app2.inject({ url: "/recent?limit=2" });
    const pastes = res.json().pastes;
    expect(pastes).toHaveLength(2);
    expect(pastes[0].language).toBe("go");
    expect(pastes[0].bytes).toBe(6);
    await app2.close();
  });
});

describe("GET /:id/meta", () => {
  it("returns metadata without consuming views", async () => {
    const app2 = build();
    const created = await app2.inject({
      method: "POST",
      url: "/paste",
      payload: { content: "some content", language: "go", maxViews: 2 },
    });
    const { id } = created.json();
    const res = await app2.inject({ url: `/${id}/meta` });
    expect(res.statusCode).toBe(200);
    const meta = res.json();
    expect(meta.bytes).toBe(12);
    expect(meta.views).toBe(0);
    expect(meta.language).toBe("go");
    expect(meta.maxViews).toBe(2);

    const meta2 = await app2.inject({ url: `/${id}/meta` });
    expect(meta2.json().views).toBe(0);
    await app2.close();
  });

  it("404s for unknown pastes", async () => {
    const app2 = build();
    const res = await app2.inject({ url: "/zzzzzzzz/meta" });
    expect(res.statusCode).toBe(404);
    await app2.close();
  });
});
