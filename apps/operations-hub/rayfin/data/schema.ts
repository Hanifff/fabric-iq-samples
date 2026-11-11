import { ControlRequest } from './ControlRequest.js';
import { EquipmentItem } from './EquipmentItem.js';
import { Finding } from './Finding.js';
import { Idea } from './Idea.js';
import { IdeaVote } from './IdeaVote.js';
import { PlanningChange } from './PlanningChange.js';
import { ProjectControl } from './ProjectControl.js';

export type AppSchema = {
  Idea: Idea;
  IdeaVote: IdeaVote;
  EquipmentItem: EquipmentItem;
  Finding: Finding;
  ProjectControl: ProjectControl;
  ControlRequest: ControlRequest;
  PlanningChange: PlanningChange;
};

export const schema = [Idea, IdeaVote, EquipmentItem, Finding, ProjectControl, ControlRequest, PlanningChange];
