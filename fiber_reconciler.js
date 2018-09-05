/*
let fiber = {
  tag: HOST_COMPONENT,
  type: "div",
  parent: parentFiber,
  child: childFiber,
  sibling: null,
  alternate: currentFiber,
  stateNode: document.createElement("div"),
  props: { children: [], className: "foo"},
  partialState: null,
  effectTag: PLACEMENT,
  effects: []
};
 */
var {Component,renderDom} = (function (global) {
    const ENOUGH_TIME = 1;
    const HOST_COMPONENT = "host";
    const CLASS_COMPONENT = "class";
    const TEXT_ELEMENT = "text";
    const HOST_ROOT = "root";

    let updateQueue = [];
    let nextUnitOfWork = null;
    let pendingCommit = null;

    function performWork(deadline) {
        workLoop(deadline);
        if (nextUnitOfWork || updateQueue.length > 1) {
            requestIdleCallback(performWork);
        }
    }

    function workLoop(deadline) {
        if (!nextUnitOfWork) {
            resetNextUnitOfWork();
        }

        while (nextUnitOfWork && deadline.timeRemaining() > ENOUGH_TIME) {
            nextUnitOfWork = performUnitOfWork(nextUnitOfWork);
        }

        if (pendingCommit) {
            commitAllWork(pendingCommit);
        }
    }

    /**
     * create the work in progress fiber from a new update
     */
    function resetNextUnitOfWork() {
        const update = updateQueue.shift();
        if (!update) {
            return;
        }

        if (update.partialState) {
            update.instance.__fiber.partialState = update.partialState;
        }

        const root = update.from === HOST_ROOT
            ? update.dom.__rootContainerFiber
            : getRoot(update.instance.__fiber);

        nextUnitOfWork = {
            tag: HOST_ROOT,
            stateNode: update.dom || root.instance,
            props: update.newProps || root.props,
            alternate: root,
        };
    }

    /**
     * get fiber root by ascned parents
     * @param {Fiber} fiber 
     */
    function getRoot(fiber) {
        while (fiber.parent) {
            fiber = fiber.parent;
        }

        return fiber;
    }

    /**
     * walks the work in progress tree
     * @param {Fiber} wipFiber 
     */
    function performUnitOfWork(wipFiber) {
        beginWork(wipFiber);
        if (wipFiber.child) {
            return wipFiber.child;
        }

        let uow = wipFiber;
        while (uow) {
            completeWork(uow);
            if (uow.sibling) {
                return uow.sibling;
            }

            uow = uow.parent;
        }
    }

    function beginWork(wipFiber) {
        if (wipFiber.tag === CLASS_COMPONENT) {
            updateClassComponent(wipFiber);
        } else {
            updateHostComponent(wipFiber);
        }
    }

    function updateClassComponent(wipFiber) {
        let instance = wipFiber.instance;
        if (!instance) {
            instance = wipFiber.stateNode = createInstance(wipFiber);
        } else if (wipFiber.props === instance.props && !wipFiber.partialState) {
            cloneChildFiber(wipFiber);
            return;
        }

        instance.props = wipFiber.props;
        instance.state = Object.assign({}, instance.state, wipFiber.partialState);
        wipFiber.partialState = null;

        const newChildElements = wipFiber.stateNode.render();
        reconcileChildrenArray(wipFiber, newChildElements);
    }

    function updateHostComponent(wipFiber) {
        if (!wipFiber.stateNode) {
            wipFiber.stateNode = createDomElement(wipFiber);
        }

        const newChildElements = wipFiber.props.children;
        reconcileChildrenArray(wipFiber, newChildElements);

    }

    function createDomElement(fiber) {
        const isTextElement = fiber.type === TEXT_ELEMENT;
        if(isTextElement){
            debugger
        }
        const dom = isTextElement
          ? document.createTextNode("")
          : document.createElement(fiber.type);
        updateDomProperties(dom, [], fiber.props);
        return dom;
      }

    // Effect tags
    const PLACEMENT = 1;
    const DELETION = 2;
    const UPDATE = 3;

    /**
     * heart of the library. Grows work in progress tree and making dom change decisions.
     * @param {Fiber} wipFiber 
     * @param {element} newChildElements 
     */
    function reconcileChildrenArray(wipFiber, newChildElements) {
        const elements = newChildElements === null
            ? []
            : Array.isArray(newChildElements)
                ? newChildElements
                : [newChildElements];

        let index = 0;
        let oldFiber = (wipFiber.alternate && wipFiber.alternate.child)|| null;
        let newFiber = null;

        while (index < elements.length || oldFiber !== null) {
            const prevFiber = newFiber;
            const element = index < elements.length && elements[index];
            const sameType = oldFiber && element && element.type === oldFiber.type;

            if (sameType) {
                newFiber = {
                    type: oldFiber.type,
                    tag: oldFiber.tag,
                    stateNode: oldFiber.stateNode,
                    props: element.props,
                    parent: wipFiber,
                    alternate: oldFiber,
                    partialState: oldFiber.partialState,
                    effectTag: UPDATE
                };
            }

            if (element && !sameType) {
                newFiber = {
                    type: element.type,
                    tag: typeof element.type === "string" ? HOST_COMPONENT : CLASS_COMPONENT,
                    props: element.props,
                    parent: wipFiber,
                    effectTag: PLACEMENT
                };
            }

            if (oldFiber && !sameType) {
                oldFiber.effectTag = DELETION;
                wipFiber.effects = wipFiber.effects || [];
                wipFiber.effects.push(oldFiber);
            }

            if (oldFiber) {
                oldFiber = oldFiber.sibling;
            }

            if (index === 0) {
                wipFiber.child = newFiber;
            } else if (prevFiber && element) {
                prevFiber.sibling = newFiber;
            }

            index++;
        }

    }

    function completeWork(fiber) {
        if (fiber.tag === CLASS_COMPONENT) {
            fiber.stateNode.__fiber = fiber;
        }

        if (fiber.parent) {
            const childEffects = fiber.effects || [];
            const thisEffects = fiber.effectTag !== null ? [fiber] : null;
            const parentEffects = fiber.parent.effects || [];
            fiber.parent.effects = parentEffects.concat(childEffects, thisEffects);
        } else {
            pendingCommit = fiber;
        }
    }

    function cloneChildFiber(parentFiber) {
        const oldFiber = parentFiber.alternate;
        if (!oldFiber) {
            return;
        }

        let oldChild = oldFiber.child;
        let prevChild = null;
        while (oldChild) {
            const newChild = {
                type: oldFiber.type,
                tag: oldFiber.tag,
                stateNode: oldFiber.stateNode,
                props: oldFiber.props,
                partialState: oldChild.partialState,
                alternate: oldChild,
                parent: parentFiber
            };

            if (prevChild) {
                prevChild.sibling = newChild;
            } else {
                parentFiber.child = newChild;
            }

            prevChild = newChild;
            oldChild = oldChild.sibling;
        }
    }

    function commitAllWork(fiber) {
        fiber.effects.forEach(f => commitWork(f));
        fiber.stateNode.__rootContainerFiber = fiber;
        nextUnitOfWork = null;
        pendingCommit = null;
    }

    function commitWork(fiber) {
        if (fiber.tag === HOST_ROOT) {
            return;
        }

        let domParentFiber = fiber.parent;
        while (domParentFiber.tag === CLASS_COMPONENT) {
            domParentFiber = domParentFiber.parent;
        }
        const domParent = domParentFiber.stateNode;

        if (fiber.effectTag === PLACEMENT && fiber.tag === HOST_COMPONENT) {
            domParent.appendChild(fiber.stateNode);
        } else if (fiber.effectTag === UPDATE) {
            updateDomProperties(fiber.stateNode, fiber.alternate.props, fiber.props);
        } else if (fiber.effectTag === DELETION) {
            commitDeletion(fiber, domParent);
        }
    }

    function commitDeletion(fiber, domParent) {
        let node = fiber;
        while (true) {
            if (node.tag === CLASS_COMPONENT) {
                node = node.child;
                continue;
            }

            domParent.removeChild(node.stateNode);
            while (node !== fiber && !node.sibling) {
                node = node.parent;
            }

            if (node === fiber) {
                return;
            }

            node = node.sibling;
        }
    }

    function updateDomProperties(dom, prevProps, nextProps) {
        const isEvent = name => name.startsWith("on");
        const isAttribute = name => !isEvent(name) && name != "children";

        // Remove event listeners
        Object.keys(prevProps).filter(isEvent).forEach(name => {
            const eventType = name.toLowerCase().substring(2);
            dom.removeEventListener(eventType, prevProps[name]);
        });

        // Remove attributes
        Object.keys(prevProps).filter(isAttribute).forEach(name => {
            dom[name] = null;
        });

        // Set attributes
        Object.keys(nextProps).filter(isAttribute).forEach(name => {
            dom[name] = nextProps[name];
        });

        // Add event listeners
        Object.keys(nextProps).filter(isEvent).forEach(name => {
            const eventType = name.toLowerCase().substring(2);
            dom.addEventListener(eventType, nextProps[name]);
        });
    }

    function renderDom(element, parentDom) {
        updateQueue.push({
            from: HOST_ROOT,
            dom: parentDom,
            newProps: { children: element }
        });
        requestIdleCallback(performWork);
    }

    function scheduleUpadate(instance, partialState) {
        updateQueue.push({
            from: CLASS_COMPONENT,
            instance: instance,
            partialState: partialState,
        });
        requestIdleCallback(performWork);
    }

    /**
     * create Component instance 
     * @param {*} fiber fiber which created instance from
     */
    function createInstance(fiber) {
        const instance = new fiber.type(fiber.props);
        instance.__fiber = fiber;
        return instance;
    }

    /**
     * Basic Component class
     */
    class Component {
        constructor(props) {
            this.props = props || {};
            this.state = this.state || {};
        }

        setState(partialState) {
            scheduleUpadate(this, partialState);
        }
    }

    return {Component, renderDom};
})(window);