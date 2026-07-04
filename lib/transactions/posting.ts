/** A posting annotation: a total-cost (`@@`) or a balance assertion (`=`). */
export type Annotation = { amount: string; currency: string };

export type Posting = {
  account: string;
  amount: string;
  currency: string;
  cost?: Annotation;
  assertion?: Annotation;
};
