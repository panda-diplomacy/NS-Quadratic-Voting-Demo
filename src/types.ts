export interface Option {
  id: string;
  name: string;
}

export interface Proposal {
  id: string;
  title: string;
  description: string;
  options: Option[];
  status: 'open' | 'closed';
}

export interface VoteAllocation {
  [optionId: string]: number; // number of votes (not credits)
}
