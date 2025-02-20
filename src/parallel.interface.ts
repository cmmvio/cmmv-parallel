export let META_PARALLEL_OPTIONS = Symbol('parallel_options');

export interface IParallelOptions {
  namespace: string;
  threads: number;
}
