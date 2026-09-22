/** Long, deterministic todo content for installed-terminal paging checks. */
export const pagingPlan = [
  { action: "clear" },
  ...Array.from({ length: 40 }, (_, index) => ({
    action: "create",
    subject: `Paging todo ${index + 1}`,
    description: Array.from(
      { length: 80 },
      (_, line) => `Todo ${index + 1} detail line ${line + 1}`
    ).join("\n")
  }))
];

export const pagingTranscript = Array.from(
  { length: 100 },
  (_, index) => `Transcript line ${index + 1}`
).join("\n");
