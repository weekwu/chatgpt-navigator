export interface Question {
  key: string;
  stable: boolean;
  element: HTMLElement | null;
  title: string;
  preview: string;
  search: string;
}
export type ScrollRoot = HTMLElement | Window;
