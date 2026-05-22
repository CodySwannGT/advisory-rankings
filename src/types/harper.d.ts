/** Harper resource base class provided by the Fabric runtime. */
declare class Resource {
  static readonly loadAsInstance?: boolean;
  /** Returns request context when a resource runs inside Harper. */
  getContext?(): unknown;
}

/** Runtime table registry injected by Harper. */
declare const tables: Record<
  string,
  {
    search(
      query?: Readonly<Record<string, unknown>>
    ): AsyncIterable<Readonly<Record<string, unknown>>>;
  }
>;
