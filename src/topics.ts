import {Fn} from "./types";

export class Topics {
    private readonly topics = new Map<string, Fn[]>();
    private readonly context;
    constructor(context: any) {
        this.context = context;
    }

    /**
     * Bind a observer to a specific topic
     * @param {Topic} topic
     * @param {Observer} observer
     * @returns {default}
     */
    on(topic: string, observer: Fn) {
        if (this.topics.has(topic)) {
            this.topics.set(topic, (this.topics.get(topic) as Fn[]).concat(observer));
        } else {
            this.topics.set(topic, [observer]);
        }
        return this;
    }
    /**
     * Get all observers for a specific topic
     * @param {Topic} topic
     * @returns {Observer[]}
     */
    getObservers(topic: string): Fn[] {
        return this.topics.get(topic) ?? [];
    };
    /**
     * Get a list of all the subscribed topics by name
     * @returns {Topic[]}
     */
    getTopics(): string[] {
        return Array.from(this.topics.keys());
    }
    /**
     * Get all observers
     * @returns {Observer[]}
     */
    getAllObservers(): Fn[] {
        //return Array.from(this.topics.values()).flat();
        const flatArray = (a: Fn[], b: Fn[]) => a.concat(b);
        return Array.from(this.topics.values()).reduce(flatArray, []);
    }
    /**
     * Unbind all or a specific observer for a topic
     * @param {Topic} topic
     * @param {Observer=} observer
     * @returns {default}
     */
    off(topic: string, observer?: Fn) {
        if (!observer) {
            this.topics.delete(topic);
            return this;
        }
        if (!this.topics.has(topic)) {
            return this;
        }

        const filteredObservers = (this.topics.get(topic) as Fn[]).filter(fn => fn !== observer);
        if (filteredObservers.length > 0) {
            this.topics.set(topic, filteredObservers);
        } else {
            this.topics.delete(topic);
        }

        return this;
    }
    clear() {
        this.topics.clear();
    }
    dispatch(topic: string, ...data: any[]) {
        this.getObservers(topic).forEach(fn => fn.apply(this.context, data));
    }
}