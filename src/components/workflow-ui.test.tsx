import { describe, expect, it } from "vitest";

import { isSuccessNoticeStatus } from "./workflow-ui";

describe("workflow notice status", () => {
  it("treats success operations as success", () => {
    expect(isSuccessNoticeStatus("added")).toBe(true);
    expect(isSuccessNoticeStatus("image-uploaded")).toBe(true);
    expect(isSuccessNoticeStatus("variant-added")).toBe(true);
    expect(isSuccessNoticeStatus("updated")).toBe(true);
  });

  it("keeps failures in the error state", () => {
    expect(isSuccessNoticeStatus("failed")).toBe(false);
    expect(isSuccessNoticeStatus("invalid")).toBe(false);
    expect(isSuccessNoticeStatus("storage-failed")).toBe(false);
  });
});
