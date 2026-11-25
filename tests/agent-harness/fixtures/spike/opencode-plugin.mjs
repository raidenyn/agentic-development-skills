import { appendFileSync } from "node:fs"
const LOG = new URL("../../../../spike.log", import.meta.url)
function log(kind, value) {
  let text
  try { text = JSON.stringify(value, (k, v) => (typeof v === "string" && v.length > 400 ? v.slice(0, 400) + "…" : typeof v === "function" ? "[fn]" : v)) } catch (e) { text = String(e) }
  appendFileSync(LOG, JSON.stringify({ t: Date.now(), kind }) + " " + text + "\n")
}
const blocked = new Set()
let compacted = new Set()
export default {
  id: "spike-harness",
  async setup(ctx) {
    log("setup", { keys: Object.keys(ctx), location: ctx.location })
    await ctx.tool.hook("execute.before", (input) => {
      log("execute.before", input)
      const cmd = JSON.stringify(input.input ?? {})
      if (cmd.includes("HARNESS_DENY")) throw new Error("HARNESS_DENIED by spike plugin")
    })
    await ctx.tool.hook("execute.after", (input) => {
      log("execute.after", input)
      if (input.status === "completed" && input.result) {
        input.result = { ...input.result, output: (input.result.output ?? "") + "\nHARNESS_AFTER" , content: [...(input.result.content ?? []), { type: "text", text: "HARNESS_AFTER" }] }
      }
    })
    for (const name of ["prompt", "compaction", "context"]) {
      try {
        await ctx.session.hook(name, (input) => {
          log("session." + name, input)
          if (name === "context" && compacted.has(input?.sessionID)) {
            log("redeliver-attempt", { sessionID: input.sessionID })
            input.system = [...(input.system ?? []), { type: "text", text: "Project rule re-delivered after compaction: the project codeword is PINEAPPLE-7." }]
          }
        })
      } catch (e) { log("hook-error", { name, e: String(e) }) }
    }
    const controller = new AbortController()
    ;(async () => {
      for await (const event of ctx.event.subscribe({ signal: controller.signal })) {
        if (!/delta|part\.updated|message\.part/.test(event.type)) log("event", event)
        if (event.type === "session.compaction.ended" || event.type === "session.compaction.started") compacted.add(event.data?.sessionID)
        if (event.type === "session.compaction.ended") {
          try { await ctx.session.synthetic({ sessionID: event.data.sessionID, text: "What is the project codeword? Answer with the codeword only, or UNKNOWN.", resume: true }); log("post-compact-synthetic", 1) } catch (e) { log("synthetic-error", String(e)) }
        }
        if (event.type === "session.execution.succeeded") {
          const id = event.data?.sessionID
          let info = null
          try { info = await ctx.session.get({ sessionID: id }); log("session.get", info) } catch (e) { log("get-error", String(e)) }
          if (process.env.SPIKE_COMPACT && !blocked.has("c" + id) && !(info && info.parentID)) {
            blocked.add("c" + id)
            try { const r = await ctx.session.compact({ sessionID: id }); log("compact-called", r ?? null) } catch (e) { log("compact-error", String(e)) }
          }
          if (process.env.SPIKE_BLOCK && !blocked.has(id) && !(info && info.parentID)) {
            blocked.add(id)
            try { await ctx.session.synthetic({ sessionID: id, text: "HARNESS_BLOCK: the spike hook blocked this turn end. Reply with exactly BLOCKSEEN.", resume: true }); log("synthetic-sent", id) } catch (e) { log("synthetic-error", String(e)) }
          }
        }
      }
    })().catch((e) => log("stream-error", String(e)))
    return async () => controller.abort()
  },
}
