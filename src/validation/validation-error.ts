export interface ValidationIssue {
  code: string;
  path: string;
  message: string;
}

export class ContractValidationError extends Error {
  readonly issues: ValidationIssue[];

  constructor(message: string, issues: ValidationIssue[]) {
    super(`${message}\n${issues.map(formatIssue).join("\n")}`);
    this.name = "ContractValidationError";
    this.issues = issues;
  }
}

function formatIssue(issue: ValidationIssue): string {
  return `- [${issue.code}] ${issue.path || "/"}: ${issue.message}`;
}
