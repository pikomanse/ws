import { Fn } from "./types";
export declare class Topics {
    private readonly topics;
    private context;
    constructor(context?: any);
    setContext(context?: any): void;
    /**
     * Bind a observer to a specific topic
     * @param {Topic} topic
     * @param {Observer} observer
     * @returns {default}
     */
    on(topic: string, observer: Fn): this;
    /**
     * Get all observers for a specific topic
     * @param {Topic} topic
     * @returns {Observer[]}
     */
    getObservers(topic: string): Fn[];
    /**
     * Get a list of all the subscribed topics by name
     * @returns {Topic[]}
     */
    getTopics(): string[];
    /**
     * Get all observers
     * @returns {Observer[]}
     */
    getAllObservers(): Fn[];
    /**
     * Unbind all or a specific observer for a topic
     * @param {Topic} topic
     * @param {Observer=} observer
     * @returns {default}
     */
    off(topic: string, observer?: Fn): this;
    clear(): void;
    dispatch(topic: string, ...data: any[]): void;
}
export default Topics;
