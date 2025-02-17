import { GenericRegistry } from "@cmmv/core";

const META_OPTIONS = Symbol('controller_options');

export class ParallelRegistry extends GenericRegistry<any> {
    public static indexByName = new Map<any, Record<string, string>>();

    public static override registerHandler(
        target: any, 
        handlerName: string,
        options?: any
    ) {
        let controller = this.controllers.get(target.constructor);
        
        if (!controller) {
            const options = Reflect.getMetadata(META_OPTIONS, target.constructor) || {};
            this.registerController(target.constructor, options);
            controller = this.controllers.get(target.constructor);
        }

        if (controller) {
            const handler = controller.handlers
                .find(msg => msg.handlerName === handlerName);
                
            if (!handler) {
                const headlerData = { 
                    namespace: options.namespace, 
                    handlerName,
                    params: [], 
                    context : null, 
                    options 
                };

                controller.handlers.push(headlerData);
            }
            else {
                handler.namespace = options.namespace;
                handler.options = options;
                handler.handlerName = handlerName;
            }

            
        }
    }

    public static registerContext(
        target: any, 
        namespace: string,
        handlerContext: Function
    ) {
        let controller = this.controllers.get(target.constructor);

        if (!controller) {
            const options = Reflect.getMetadata(META_OPTIONS, target.constructor) || {};
            this.registerController(target.constructor, options);
            controller = this.controllers.get(target.constructor);
        }

        if (controller) {
            const handler = controller.handlers.find(msg => msg.namespace === namespace);

            if (!handler) {
                controller.handlers.push({ 
                    namespace, params: [], 
                    context : handlerContext, 
                    options: {} 
                });
            }
            else handler.context = handlerContext;
        }
    }

    public static override registerParam(
        target: any,
        handlerName: string,
        paramType: string,
        index: number,
    ) {
        let controller = this.controllers.get(target.constructor);
        const options = Reflect.getMetadata(META_OPTIONS, target.constructor) || {};
   
        if (!controller) {
            this.registerController(target.constructor, options);
            controller = this.controllers.get(target.constructor);
        }

        if (controller) {
            let handler = controller.handlers.find(
                msg => msg.handlerName === handlerName,
            );

            if (!handler) {
                handler = { handlerName, params: [] };
                controller.handlers.push(handler);
            }

            handler.params = handler.params || [];
            handler.params.push({ paramType, index });

            controller.handlers.find(
                (msg, index) => {
                    if(msg.handlerName === handlerName)
                        controller.handlers[index] = handler;
                },
            );

            this.controllers.set(target.constructor, controller);            
        }
    }
};