import { Module } from "@cmmv/core";

import { ParallelConfig } from "./parallel.config";
import { ParallelProvider } from "./parallel.provider";

export const ParallelModule = new Module('parallel', {
    configs: [ParallelConfig],
    providers: [ParallelProvider],
});
