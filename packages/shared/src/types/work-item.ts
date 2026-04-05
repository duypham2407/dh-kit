export type WorkItemStatus = "pending" | "in_progress" | "done" | "blocked";

export type WorkItemState = {
  id: string;
  sessionId: string;
  lane: "delivery" | "migration";
  title: string;
  description: string;
  ownerRole: "implementer" | "reviewer" | "tester";
  dependencies: string[];
  parallelizable: boolean;
  executionGroup?: string;
  status: WorkItemStatus;
  targetAreas: string[];
  acceptance: string[];
  validationPlan: string[];
  reviewStatus: "pending" | "pass" | "fail";
  testStatus: "pending" | "pass" | "fail" | "partial";
};
