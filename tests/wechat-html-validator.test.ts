import { describe, expect, it } from "vitest";

import { validateWechatHtml } from "../src/validation/wechat-html-validator.js";

describe("WeChat paste fragment validation", () => {
  it("accepts a leaf-wrapped, inline-only fragment", () => {
    expect(validateWechatHtml('<section style="padding:0"><p><span leaf="">正文。</span></p></section>')).toMatchObject({
      valid: true,
      errors: [],
      leafCount: 1,
    });
  });

  it("rejects unsafe styles and unwrapped CJK text", () => {
    const result = validateWechatHtml('<div class="x" style="position:absolute">正文。</div>');
    expect(result.valid).toBe(false);
    expect(result.errors.join("\n")).toMatch(/<div>|class\/id|positioning|not wrapped/u);
  });
});
