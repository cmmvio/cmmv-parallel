import { Singleton, Service, Application } from '@cmmv/core';

import { ParallelRegistry } from './parallel.registry';
import { AbstractParallel } from './parallel.abstract';
import { ThreadPool } from './threadpool';

@Service('parallel')
export class ParallelProvider extends Singleton {
  public static async loadConfig(application: Application): Promise<void> {
    const controllers: any = ParallelRegistry.getControllers();

    controllers.forEach(async ([controllerClass, metadata]) => {
      const paramTypes =
        Reflect.getMetadata('design:paramtypes', controllerClass) || [];

      const instances = paramTypes.map((paramType: any) =>
        application.providersMap.get(paramType.name),
      );

      const controllerInstance = new controllerClass(...instances);

      metadata.handlers.forEach((handlerMetadata) => {
        const { handlerName, options, context } = handlerMetadata;

        if (options && !ThreadPool.hasThreadPool(options.namespace)) {
          if (controllerInstance instanceof AbstractParallel) {
            ThreadPool.createThreadPool(
              options,
              controllerInstance[handlerName],
              handlerMetadata,
              context,
            );
          }
        }
      });
    });
  }
}
