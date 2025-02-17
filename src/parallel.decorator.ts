import { ParallelRegistry } from "./parallel.registry";

import { 
    IParallelOptions
} from "./parallel.interface";


export function Parallel(options: IParallelOptions): MethodDecorator {
    return (target, propertyKey: string | symbol) => {
        ParallelRegistry.registerHandler(target, propertyKey as string, options);
    };
}

export function TreadContext(namespace: string): MethodDecorator {
    return (target, propertyKey: string | symbol, context?: any) => {
        ParallelRegistry.registerContext(target, namespace, context.value);
    };
}

export function Tread(): ParameterDecorator {
    return (target, propertyKey: string | symbol, parameterIndex: number) => {
        ParallelRegistry.registerParam(
            target,
            propertyKey as string,
            'thread',
            parameterIndex
        );
    } ;
}

export function ThreadData(): ParameterDecorator {
    return (target, propertyKey: string | symbol, parameterIndex: number) => {
        ParallelRegistry.registerParam(
            target,
            propertyKey as string,
            'data',
            parameterIndex,
        );
    };
}