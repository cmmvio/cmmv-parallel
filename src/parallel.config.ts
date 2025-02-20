import { ConfigSchema } from '@cmmv/core';

export const ParallelConfig: ConfigSchema = {
  parallel: {
    maxThreads: {
      required: false,
      type: 'number',
      default: 6,
    },
  },
};
