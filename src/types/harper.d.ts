declare class Resource {
  static loadAsInstance?: boolean;
  getContext?(): unknown;
}

type HarperTable = {
  search(query?: Record<string, unknown>): AsyncIterable<Record<string, unknown>>;
};

declare const tables: Record<string, HarperTable>;
