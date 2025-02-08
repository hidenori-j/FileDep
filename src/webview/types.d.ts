interface GraphNode {
    id: string | number;
    name: string;
    fullPath: string;
    dirPath: string;
    connections: number;
    x?: number;
    y?: number;
    fx?: number | null;
    fy?: number | null;
}

interface GraphLink {
    source: string | number;
    target: string | number;
}

interface GraphData {
    nodes: GraphNode[];
    links: GraphLink[];
}

// D3.jsの型拡張
declare module 'd3' {
    interface D3DragEvent<Element, Datum> {
        sourceEvent: MouseEvent;
        subject: Datum;
        target: Element;
        x: number;
        y: number;
        dx: number;
        dy: number;
        active: boolean;
    }

    export function forceSimulation<N extends SimulationNodeDatum>(nodes: N[]): Simulation<N, undefined>;
    export function forceLink<N extends SimulationNodeDatum, L extends SimulationLinkDatum<N>>(links: L[]): Force<N, L>;
    export function forceManyBody<N extends SimulationNodeDatum>(): Force<N, undefined>;
    export function forceCenter<N extends SimulationNodeDatum>(x: number, y: number): Force<N, undefined>;
    export function forceCollide<N extends SimulationNodeDatum>(radius?: number): Force<N, undefined>;

    export function drag<Element extends d3.BaseType, Datum>(): d3.DragBehavior<Element, Datum, Datum>;

    interface DragBehavior<Element extends d3.BaseType, Datum, Subject> {
        on(type: string, listener: null): this;
        on(type: string, listener: (this: Element, event: D3DragEvent<Element, Subject>, d: Datum) => void): this;
    }

    interface Selection<GElement extends BaseType, Datum, PElement extends BaseType, PDatum> {
        on(type: string, listener: null): this;
        on(type: string, listener: (this: GElement, event: Event, d: Datum) => void): this;
        data(): Datum[];
        data<NewDatum>(data: NewDatum[]): Selection<GElement, NewDatum, PElement, PDatum>;
        join<Element extends BaseType>(enter: (enter: Selection<null, Datum, PElement, PDatum>) => Selection<Element, Datum, PElement, PDatum>): Selection<Element | GElement, Datum, PElement, PDatum>;
        append<K extends keyof ElementTagNameMap>(type: K): Selection<ElementTagNameMap[K], Datum, GElement, Datum>;
        attr(name: string, value: string | number | boolean | null): this;
        style(name: string, value: string | number | boolean | null): this;
        text(value: string | ((d: Datum) => string)): this;
        classed(names: string, value: boolean): this;
    }

    interface Simulation<N extends SimulationNodeDatum, L extends SimulationLinkDatum<N> | undefined> {
        force(name: string, force: Force<N, L> | null): this;
        alpha(value: number): this;
        alphaTarget(value: number): this;
        restart(): this;
        stop(): this;
        nodes(): N[];
        nodes(nodes: N[]): this;
        on(type: string, listener: () => void): this;
    }

    interface Force<N extends SimulationNodeDatum, L extends SimulationLinkDatum<N> | undefined> {
        strength(strength: number): this;
        distance(distance: number): this;
        radius(radius: number): this;
        distanceMax(max: number): this;
        id(id: (node: N) => string | number): this;
    }
}

declare namespace vis {
    class Network {
        constructor(
            container: HTMLElement,
            data: { nodes: DataSet<any>; edges: DataSet<any> },
            options?: any
        );
        
        on(event: string, callback: (params: NetworkEvents) => void): void;
        setData(data: { nodes: DataSet<any>; edges: DataSet<any> }): void;
    }

    class DataSet<T> {
        constructor(data: T[]);
    }

    interface NetworkEvents {
        nodes: string[];
        edges: string[];
        event: Event;
    }
} 