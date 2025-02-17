import { Singleton } from "@cmmv/core";
import { IParallelOptions } from "./parallel.interface";
import { ThreadPool } from "./threadpool";

export abstract class AbstractParallel extends Singleton {
    private pools = new Map<Symbol, ThreadPool>();

    public getThreadPool(namespace: string){
        const symbolName = Symbol(namespace);

        return this.pools.has(symbolName) ? 
            this.pools.get(symbolName): null;
    }

    public creataThreadPool(
        options: IParallelOptions, 
        fn: Function, 
        schema: any
    ){
        const symbolName = Symbol(options.namespace);
        this.pools.set(symbolName, new ThreadPool(options, fn, schema));
    }
}