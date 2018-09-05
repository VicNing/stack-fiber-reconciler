/*
ReactElement :: {
    type::String,
    props :: {
        class::a
        children::[ReactElement]
    }
};
*/

/*
Instance :: {
    element::ReactElement,
    dom::HtmlElement,
    childInstances::[Instance],
    childKeys::[String]
};
 */
var { renderDom, Component } = (function (global) {
    let rootInstance = null;

    const isEventHandler = propname => propname.slice(0, 2) === 'on';
    const isAttribute = propname => !isEventHandler(propname) && propname !== 'children';

    function instantiate(element, parentDom) {
        const { type, props } = element;
        let dom = null;

        if (typeof type === 'string') {
            if (type === 'TEXT_NODE') {
                dom = document.createTextNode(props.text);
            } else {
                dom = document.createElement(type);
            }


            //attach event handlers
            Object.keys(props)
                .filter(isEventHandler)
                .forEach(propname => {
                    let eventName = propname.substring(2);
                    dom.addEventListener(eventName, props[propname]);
                });

            //add dom attributes
            Object.keys(props)
                .filter(isAttribute)
                .forEach(propname => {
                    dom[propname] = props[propname];
                });

            //recursive call renderDom for children elements

            const childInstances = props.children ? props.children.map(child => {
                return instantiate(child, dom);
            }) : [];

            const childKeys = props.children ? props.children.map((child, index) => {
                return child.props['key'];
            }) : [];

            parentDom.appendChild(dom);

            return { element, dom, childInstances, childKeys };

        } else {
            const instance = {};
            const publicInstance = createPublicInstance(element);
            const childElement = publicInstance.render();
            const childInstance = instantiate(childElement,parentDom);
            publicInstance.__internalInstance = instance;

            return Object.assign(instance,{element,publicInstance,childInstances:[childInstance],dom:childInstance.dom});
        }
    }

    function reconcile(instance, element) {
        if(typeof instance.element.type === 'function'){
            return reconcile(instance.childInstances[0],instance.publicInstance.render());
        }

        //remove old event handlers
        Object.keys(instance.element.props)
            .filter(isEventHandler)
            .forEach(propname => {
                let eventName = propname.substring(2);
                instance.dom.removeEventListener(eventName);
            });

        //attach event handlers
        Object.keys(element.props)
            .filter(isEventHandler)
            .forEach(propname => {
                let eventName = propname.substring(2);
                instance.dom.addEventListener(eventName, props[propname]);
            });

        //remove old dom attributes
        Object.keys(instance.element.props)
            .filter(isAttribute)
            .forEach(propname => {
                if (element.type === 'TEXT_NODE') { return }
                instance.dom[propname] = null;
            });

        //add dom attributes
        Object.keys(element.props)
            .filter(isAttribute)
            .forEach(propname => {
                if (element.type === 'TEXT_NODE') {
                    instance.dom['nodeValue'] = element.props['text'];
                } else {
                    instance.dom[propname] = element.props[propname];
                }
            });

        //comparing children's key
        const { newChildInstances, newChildKeys } = element.props.children ? element.props.children.reduce((acc, childElement) => {
            const childIndex = instance.childKeys.indexOf(childElement.props['key']);
            let newInstance = null;
            if (childIndex === -1) {
                newInstance = instantiate(childElement, instance.dom);
            } else if (childElement.type !== instance.childInstances[childIndex].element.type) {
                instance.dom.removeChild(instance.childInstances[childIndex].dom);
                newInstance = instantiate(childElement, instance.dom);
            } else {
                newInstance = reconcile(instance.childInstances[childIndex], childElement);
            }

            acc.newChildInstances.push(newInstance);
            acc.newChildKeys.push(newInstance.element.props['key']);
            return acc;

        }, { newChildInstances: [], newChildKeys: [] }) : { newChildInstances: [], newChildKeys: [] };

        //remove invalid child keys
        instance.childInstances.forEach(childInstance => {
            let index = newChildKeys.indexOf(childInstance.element.props['key']);
            if (index === -1) {
                instance.dom.removeChild(childInstance.dom);
            }
        });

        instance.element = element;
        instance.childInstances = newChildInstances;
        instance.childKeys = newChildKeys;

        return instance;
    }

    function renderDom(element, parentDom) {
        if (rootInstance && (element.type === rootInstance.element.type)) {
            rootInstance = reconcile(rootInstance, element);
        } else {
            rootInstance = instantiate(element, parentDom);
        }

    }

    function createElement() {
        
    }

    function createPublicInstance(element){
        const { type, props } = element;
        const publicInstance = new type(props);
        return publicInstance;
    }

    class Component {
        constructor(props) {
            this.props = props || {};
            this.state = this.state || {};
        }

        setState(partialState) {
            this.state = Object.assign({}, this.state, partialState);
            this.updateInstance(this.__internalInstance);
        }

        updateInstance(internalInstance) {
            let element = this.render();
            reconcile(internalInstance.childInstances[0],element);
        }

        _render(props){
            this.props = props;
            this.render();
        }
    }

    return { renderDom, createElement, Component };
})(window);
