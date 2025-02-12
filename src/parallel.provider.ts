import { 
    Singleton, Service, 
    Application
} from "@cmmv/core";

import { 
    ParallelRegistry 
} from "./parallel.registry";

import { AbstractParallel } from "./parallel.abstract";

@Service("parallel")
export class ParallelProvider extends Singleton {
    public static async loadConfig(application: Application): Promise<void> {
        const instance = ParallelProvider.getInstance();
        const controllers: any = ParallelRegistry.getControllers();

        controllers.forEach(async ([controllerClass, metadata]) => {
            const paramTypes =
                Reflect.getMetadata('design:paramtypes', controllerClass) || [];

            const instances = paramTypes.map((paramType: any) =>
                application.providersMap.get(paramType.name),
            );

            const controllerInstance = new controllerClass(...instances);

            metadata.handlers.forEach(handlerMetadata => {
                const { handlerName, params, options } = handlerMetadata;

                if(controllerInstance instanceof AbstractParallel) {
                    controllerInstance.creataThreadPool(
                        options, 
                        controllerInstance[handlerName],
                        handlerMetadata
                    );
                }
            });
        })
    }
}