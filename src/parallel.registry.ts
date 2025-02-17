import { GenericRegistry } from "@cmmv/core";

const META_OPTIONS = Symbol('controller_options');
const META_CONTEXT = Symbol('controller_context');

export class ParallelRegistry extends GenericRegistry<any> {
    public static override registerHandler(
        target: any, 
        handlerName: string, 
        options?: object
    ) {
        let controller = this.controllers.get(target.constructor);

        if (!controller) {
            const options = Reflect.getMetadata(META_OPTIONS, target.constructor) || {};
            this.registerController(target.constructor, options);
            controller = this.controllers.get(target.constructor);
        }

        if (controller) {
            const handler = controller.handlers.find(msg => msg.handlerName === handlerName);
            if (!handler) controller.handlers.push({ handlerName, params: [], context : null, options });
            else handler.options = options;
        }
    }

    public static registerContext(
        target: any, 
        handlerName: string, 
        namespace: string
    ) {
        let controller = this.controllers.get(target.constructor);

        if (!controller) {
            const options = Reflect.getMetadata(META_OPTIONS, target.constructor) || {};
            this.registerController(target.constructor, options);
            controller = this.controllers.get(target.constructor);
        }

        if (controller) {
            const handler = controller.handlers.find(msg => msg.handlerName === handlerName);
            if (!handler) controller.handlers.push({ handlerName, params: [], context : target.toString() });
            else handler.context = target.toString();
        }
    }
};