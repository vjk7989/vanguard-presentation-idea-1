export type IdeaKey = 1 | 2 | 3 | 4;
export type DeskView = "overview" | "work" | "activity";
export type PathKind = "instruction" | "confirmed" | "evidence";

export type IdeaRole = {
  id: string;
  title: string;
  organization: string;
  responsibility: string;
  metricLabel: string;
  metricValue: string;
  workTitle: string;
  sampleRecords: { reference: string; title: string; detail: string; status: string }[];
};

export type IdeaAction = {
  id: string;
  role: string;
  label: string;
  detail: string;
  source: string;
  target: string;
  pathKind: PathKind;
};

export type IdeaTransition = {
  state: Record<string, unknown>;
  label: string;
  source: string;
  target: string;
  pathKind: PathKind;
  reference: string;
};

export type IdeaSpec = {
  id: 2 | 3 | 4;
  title: string;
  summary: string;
  roles: IdeaRole[];
  initialState(): Record<string, unknown>;
  actions(state: Record<string, unknown>): IdeaAction[];
  transition(state: Record<string, unknown>, actionId: string): IdeaTransition;
};
