import { appendFileSync } from "node:fs"
const LOG = new URL("../../../../spike.log", import.meta.url)
const log = (kind, v) => appendFileSync(LOG, JSON.stringify({ t: Date.now(), kind, v }) + "\n")
export default {
  id: "spike2",
  async setup(ctx) {
    await ctx.tool.hook("execute.after", async (input) => {
      const { info, ...rest } = input
      log("execute.after.start", rest)
      if (input.tool !== "read" && process.env.SPIKE_SLOW) await new Promise((r) => setTimeout(r, Number(process.env.SPIKE_SLOW) * 1000))
      if (input.status === "completed" && input.result) input.result.content = [...(input.result.content ?? []), { type: "text", text: "HARNESS_SLOW_AFTER done" }]
      log("execute.after.end", { tool: input.tool })
    })
  },
}
