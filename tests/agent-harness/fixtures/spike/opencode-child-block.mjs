import { appendFileSync } from "node:fs"
const LOG = new URL("../../../../spike.log", import.meta.url)
const log = (kind, v) => appendFileSync(LOG, JSON.stringify({ t: Date.now(), kind, v }) + "\n")
const parents = new Map(); const blocked = new Set()
export default { id: "child-spike", async setup(ctx) {
  await ctx.session.hook("prompt", (i) => log("prompt", { sessionID: i.sessionID, text: (i.prompt?.text || "").slice(0, 160) }))
  const c = new AbortController()
  ;(async () => { for await (const e of ctx.event.subscribe({ signal: c.signal })) {
    const id = e.data?.sessionID
    if (!/^session\.(execution|inbox|created)/.test(e.type)) continue
    let parent = parents.get(id)
    if (parent === undefined && id) { try { const info = await ctx.session.get({ sessionID: id }); parent = info.parentID || null; parents.set(id, parent) } catch { parent = null } }
    log(e.type, { id, parent })
    if (e.type === "session.execution.succeeded" && parent && !blocked.has(id)) {
      blocked.add(id)
      await new Promise((r) => setTimeout(r, 3000)) // a slow verify
      try { await ctx.session.synthetic({ sessionID: id, text: "verify: check failed. Append the line FIXED to child.md, then reply DONE.", resume: true }); log("child-block-sent", { id }) } catch (err) { log("synthetic-error", String(err)) }
    }
  } })().catch((e) => log("stream-error", String(e)))
  return async () => c.abort()
} }
